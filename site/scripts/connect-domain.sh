#!/usr/bin/env bash
# Point code.tbelt.online and www.code.tbelt.online at the Cloudflare Pages
# project. The apex and www hosts are not touched.
#
# This replaces whatever that hostname serves today. Before changing
# anything it saves their current DNS records to dns-backup-<timestamp>.json,
# which restore-domain.sh puts back.
#
# Needs CLOUDFLARE_API_TOKEN with Account > Cloudflare Pages > Edit and
# Zone > DNS > Edit on tbelt.online. CLOUDFLARE_ACCOUNT_ID is optional: the
# script reads it from the zone.
# Usage: site/scripts/connect-domain.sh
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  CLOUDFLARE_ACCOUNT_ID=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME:-tbelt.online}" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].account.id // empty')
  : "${CLOUDFLARE_ACCOUNT_ID:?could not read the account from the zone; set CLOUDFLARE_ACCOUNT_ID}"
fi
PROJECT=${PROJECT:-tbelt-online}
ZONE_NAME=${ZONE_NAME:-tbelt.online}
HOSTS=("code.$ZONE_NAME" "www.code.$ZONE_NAME")
api=https://api.cloudflare.com/client/v4

cf() {
  local method=$1 path=$2 body=${3:-}
  local response
  response=$(curl -sS -X "$method" "$api$path" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
    ${body:+--data "$body"})
  if [[ $(jq -r '.success' <<<"$response") != true ]]; then
    echo "connect-domain: $method $path failed: $(jq -c '.errors' <<<"$response")" >&2
    return 1
  fi
  printf '%s' "$response"
}

zone_id=$(cf GET "/zones?name=$ZONE_NAME" | jq -r '.result[0].id')
[[ -n "$zone_id" && "$zone_id" != null ]] || { echo "connect-domain: zone $ZONE_NAME not found" >&2; exit 1; }
pages_host=$(cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT" | jq -r '.result.subdomain')
echo "connect-domain: Pages project $PROJECT serves $pages_host"

backup="dns-backup-$(date -u +%Y%m%dT%H%M%SZ).json"
records='[]'
for host in "${HOSTS[@]}"; do
  found=$(cf GET "/zones/$zone_id/dns_records?name=$host&per_page=100" | jq '[.result[] | select(.type == "A" or .type == "AAAA" or .type == "CNAME")]')
  records=$(jq -s 'add' <(printf '%s' "$records") <(printf '%s' "$found"))
done
jq '{zone_id: $zone, records: .}' --arg zone "$zone_id" <<<"$records" > "$backup"
echo "connect-domain: saved $(jq length <<<"$records") current record(s) to $backup"

for host in "${HOSTS[@]}"; do
  for id in $(jq -r --arg host "$host" '.[] | select(.name == $host) | .id' <<<"$records"); do
    cf DELETE "/zones/$zone_id/dns_records/$id" >/dev/null
  done
  cf POST "/zones/$zone_id/dns_records" \
    "$(jq -nc --arg name "$host" --arg target "$pages_host" '{type: "CNAME", name: $name, content: $target, proxied: true, ttl: 1}')" >/dev/null
  if ! cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains/$host" >/dev/null 2>&1; then
    cf POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" "$(jq -nc --arg name "$host" '{name: $name}')" >/dev/null
  fi
  echo "connect-domain: $host -> $pages_host"
done
echo "connect-domain: done. Certificates can take a few minutes; to undo, run site/scripts/restore-domain.sh $backup"
