# code.tbelt.online

The tBelt Code download site, served by Cloudflare Pages from this folder.

- `public/` holds the static page, styles, and images, plus `robots.txt`, `sitemap.xml` and `favicon.ico`. `assets/og.png` is the 1200x630 share card that link previews show.
- `functions/download/[platform].js` answers `/download/windows`, `/download/mac`, and `/download/linux` with a redirect to the newest installer in the update bucket, or to the download section when that platform has no published release.
- `functions/api/releases.js` answers `/api/releases` with the version, size, and date of each platform's newest installer; the page fills its download cards from it.
- `shared/releases.js` reads the electron-builder channel metadata that [upload-target.ts](../apps/desktop/scripts/upload-target.ts) writes: `nightly*.yml` and, for stable versions, `latest*.yml` under `dsh-desk/feeds/<target>/`, whose absolute URLs point at `dsh-desk/bin/<target>/`. Releases uploaded before that layout, under `_/harness/desktop/stable/<target>/`, still count; the newest version across both wins. A new release appears on the site within five minutes of its upload, with no site change.
- `wrangler.toml` names the Pages project and sets `DOWNLOAD_ORIGIN`, the bucket origin.

## Deploy

[site-deploy.yml](../.github/workflows/site-deploy.yml) deploys on every push to `main` that touches `site/` and creates a preview deployment for pull requests. It needs the repository secret `CLOUDFLARE_API_TOKEN` (Account > Cloudflare Pages > Edit) and skips the deploy without it. `CLOUDFLARE_ACCOUNT_ID` (secret or variable) is optional when the token can read the tbelt.online zone, which names its account.

`scripts/connect-domain.sh` points `code.tbelt.online` and `www.code.tbelt.online` at the Pages project after saving their current DNS records to a backup file; `scripts/restore-domain.sh <backup>` puts them back. The token for these scripts also needs Zone > DNS > Edit on `tbelt.online`. The `Site domain` workflow runs `connect-domain.sh` with the repository secret and keeps the backup as its `dns-backup` artifact; dispatching it with `restore_run_id` set to that run restores the records.

## Local preview

```sh
cd site && npx wrangler@4 pages dev --port 8788
```
