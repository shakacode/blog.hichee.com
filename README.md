# blog.hichee.com (Astro Migration)

Migration target for `blog.hichee.com`, moving from WordPress to Astro + Cloudflare Pages.

## Decisions

- Repository remains **private** during migration.
- WordPress drafts are migrated as unpublished content under `src/content/drafts/`.
- We create one GitHub issue per unpublished draft (`draft-review` label) so nothing gets lost.
- Media strategy defaults to object storage/CDN (Cloudflare R2), not repository storage, unless final measured media size is small enough.

## Local Setup

```bash
yarn install
yarn dev
```

## Migration Workflow

1. Download WordPress WXR export (requires WP login):

```bash
yarn migrate:download:wxr
```

2. Convert WXR to Astro content collections:

```bash
node scripts/convert-wxr-to-content.mjs --input data/raw/wordpress-export-YYYY-MM-DDTHH-mm-ss-sssZ.xml
```

3. Build media manifest + size estimate:

```bash
node scripts/build-media-manifest.mjs --with-head
```

4. Create GitHub issues for drafts:

```bash
# dry run
node scripts/create-draft-issues.mjs

# create issues
node scripts/create-draft-issues.mjs --apply
```

## Staging and Cutover Plan

- Stage site on `newblog.hichee.com` via Cloudflare Pages.
- Run QA checklist (links, SEO, images, page templates, redirects, performance).
- Freeze WordPress edits, run final delta sync, then switch `blog.hichee.com`.
