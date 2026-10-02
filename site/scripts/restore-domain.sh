#!/usr/bin/env bash
# Undo connect-domain.sh: detach the hostnames from Pages and put back the DNS
# records saved in the backup file it wrote.
# Usage: site/scripts/restore-domain.sh dns-backup-<timestamp>.json
set -euo pipefail

backup=${1:?usage: restore-domain.sh dns-backup-<timestamp>.json}
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  CLOUDFLARE_ACCOUNT_ID=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME:-tbelt.online}" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].account.id // empty')
  : "${CLOUDFLARE_ACCOUNT_ID:?could not read the account from the zone; set CLOUDFLARE_ACCOUNT_ID}"
fi
PROJECT=${PROJECT:-tbelt-online}
api=https://api.cloudflare.com/client/v4
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json')

zone_id=$(jq -r '.zone_id' "$backup")
for host in $(jq -r '[.records[].name] | unique | .[]' "$backup"); do
  curl -sS -X DELETE "$api/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains/$host" "${auth[@]}" >/dev/null || true
  for id in $(curl -sS "$api/zones/$zone_id/dns_records?name=$host&type=CNAME" "${auth[@]}" | jq -r '.result[].id'); do
    curl -sS -X DELETE "$api/zones/$zone_id/dns_records/$id" "${auth[@]}" >/dev/null
  done
done
jq -c '.records[] | {type, name, content, proxied, ttl}' "$backup" | while read -r record; do
  curl -sS -X POST "$api/zones/$zone_id/dns_records" "${auth[@]}" --data "$record" | jq -r '"restore-domain: \(.result.name // "error") \(.result.type // "") \(.result.content // (.errors | tostring))"'
done
