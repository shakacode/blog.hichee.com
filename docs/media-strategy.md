# Media Strategy

## Recommendation

Use **Cloudflare R2** for migrated WordPress media and keep repo media limited to design assets/logos.

## Why

- WordPress has many years of uploads; repo growth would hurt clone and CI time.
- R2 + CDN keeps deploys small and fast.
- URLs can be rewritten from `blog.hichee.com/wp-content/uploads/...` to `assets.hichee.com/...` (or equivalent).

## Rules

- In-repo assets: brand assets, icons, illustrations needed by site chrome.
- Off-repo assets: all migrated WordPress uploads used in article bodies.

## Validation

Run:

```bash
node scripts/build-media-manifest.mjs --with-head
```

This produces `data/media-manifest.json` with estimated total bytes and itemized URLs.
