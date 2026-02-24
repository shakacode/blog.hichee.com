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

## Deployment Setup (Cloudflare Pages)

Project: `blog-hichee-com`  
Current Pages URL: `https://blog-hichee-com-git.pages.dev`

This project is connected to GitHub (`shakacode/blog.hichee.com`) in Cloudflare Pages.

- Pushes to `main` trigger production deployments in Cloudflare.
- Pull requests trigger preview deployments in Cloudflare.

No custom GitHub deploy workflow is required for Pages deploys.

## Migration Workflow

1. Extract WordPress content through authenticated REST API (requires WP login):

```bash
yarn migrate:download:rest
```

2. Convert REST export to Astro content collections:

```bash
node scripts/convert-rest-to-content.mjs --input data/raw/wp-rest-export-YYYY-MM-DDTHH-mm-ss-sssZ.json
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
