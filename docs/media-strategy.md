# Media Strategy

## Recommendation

Use **Cloudflare R2** for migrated WordPress media and keep repo media limited to design assets/logos.

## Why

- WordPress has many years of uploads; repo growth would hurt clone and CI time.
- R2 + CDN keeps deploys small and fast.
- The current static site already emits root-relative `/wp-content/*` URLs, so the safest cutover path is to keep those exact paths and serve them from R2 with a Pages Function.
- The Pages Function should serve deployed static assets first, then R2, then the legacy WordPress origin. Legacy origin fallback must be last so a slow or unavailable WordPress server cannot block media already present in the Pages deployment.

## Rules

- In-repo assets: brand assets, icons, illustrations needed by site chrome.
- Off-repo assets: all migrated WordPress uploads used in article bodies.
- Migration unit: exact `/wp-content/*` keys referenced by the built `dist/` output, not only attachment originals.

## Validation

Run:

```bash
yarn migrate:media:manifest:site
```

This produces `output/wp-content-manifest.json` with the exact built-site keys plus the subset still missing from local `public/wp-content`.

Then sync those keys to R2:

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> yarn migrate:media:sync:r2
```

## Cutover Safety Net

- Before DNS cutover, `newblog.hichee.com` and preview branches can safely fall back to the current live `https://blog.hichee.com` for missing media.
- Before moving `blog.hichee.com` to the new Pages site, create a backup hostname for the old WordPress instance, then set `LEGACY_MEDIA_ORIGIN` to that backup hostname and redeploy.
- After cutover, keep the backup hostname online until the R2 bucket has warmed or a full bulk sync is complete.
- Keep the backup hostname available for manual recovery of any inherited broken WordPress media that was not present locally or in R2.

## Latest Validation

As of 2026-06-02 after cutover:

- Built-site media manifest contains 20,893 unique `/wp-content/*` keys.
- Post-cutover route parity between `https://newblog.hichee.com` and `https://blog.hichee.com` checked 713 generated routes with no status or redirect mismatches.
- Generated `dist/` output contains no absolute `blog.hichee.com/wp-content` references; public pages use root-relative media URLs.
- A representative migrated media URL returned 200 from both `https://blog.hichee.com/wp-content/uploads/2022/08/Hichee.png` and `https://newblog.hichee.com/wp-content/uploads/2022/08/Hichee.png`.
- `LEGACY_MEDIA_ORIGIN` points at `https://oldblog.hichee.com` in `wrangler.jsonc`, so final `blog.hichee.com` Pages traffic can fetch missing R2 media from the old WordPress origin after cutover.
- The `/wp-content` function now checks Pages static assets before consulting the legacy origin.
- Known follow-up: 85 referenced media paths return 404 on both `newblog.hichee.com` and `blog.hichee.com`; early sync logs show at least some were already 404 on the old WordPress origin. Restore these from the Cloudways backup when the NAS share is mounted.
