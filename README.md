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
Primary Pages URL: `https://blog-hichee-com.pages.dev`

This repo includes a GitHub Actions workflow that deploys to Cloudflare Pages on:
- `push` to `main` (production branch deploy)
- every `pull_request` (preview branch deploy)

One-time GitHub repo secrets required:
- `CLOUDFLARE_ACCOUNT_ID` = `fed541b7e7055a428a1b045aa3cd2c89`
- `CLOUDFLARE_API_TOKEN` = Cloudflare API token with at least:
  - `Account: Cloudflare Pages:Edit`
  - `Account: Account Settings:Read`

Recommended token scope additions for smoother domain/DNS ops:
- `Zone: DNS:Edit`
- `Zone: Zone:Read`

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
