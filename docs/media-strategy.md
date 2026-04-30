# Media Strategy

## Recommendation

Use **Cloudflare R2** for migrated WordPress media and keep repo media limited to design assets/logos.

## Why

- WordPress has many years of uploads; repo growth would hurt clone and CI time.
- R2 + CDN keeps deploys small and fast.
- The current static site already emits root-relative `/wp-content/*` URLs, so the safest cutover path is to keep those exact paths and serve them from R2 with a Pages Function.
- When an object is missing from R2, the Pages Function can fetch it from the legacy WordPress origin and cache it into R2 on demand.

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

## Latest Validation

As of 2026-04-30:

- Built-site media manifest contains 21,002 unique `/wp-content/*` keys.
- Full parity against `https://blog.hichee.com` and `https://newblog.hichee.com` found no final status or content-type regressions after transient retries.
- Generated `dist/` output contains no absolute `blog.hichee.com/wp-content` references; public pages use root-relative media URLs.
- A representative migrated media URL returned 200 from both `https://blog.hichee.com/wp-content/uploads/2022/08/Hichee.png` and `https://newblog.hichee.com/wp-content/uploads/2022/08/Hichee.png`.
- Cutover is still blocked until `LEGACY_MEDIA_ORIGIN` points at a verified backup WordPress hostname, because once `blog.hichee.com` serves the Pages site it can no longer be used as the fallback origin for missing R2 objects.
