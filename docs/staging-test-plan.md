# Staging Test Plan (newblog.hichee.com)

Current production deployment: `https://47bd19d6.blog-hichee-com-git.pages.dev`
Current custom domain status: `newblog.hichee.com` is live on the Cloudflare Pages project.

## 1) Content Parity

- Verify counts: published posts/pages match migration report.
- Spot-check at least 50 representative URLs across years/categories.
- Confirm draft content is not publicly routable.

## 2) Asset Validation

- Validate all in-content images load.
- Validate featured images and social card images.
- Identify broken or hotlinked resources.

## 3) SEO Validation

- Titles and meta descriptions present.
- Canonical tags point to staging host before cutover.
- XML sitemap present and complete.
- Robots policy correct for staging.

## 4) URL and Redirect Validation

- Confirm unchanged paths resolve 200.
- Validate redirect mappings for changed paths.
- Confirm legacy feed/utility URLs redirect intentionally.

## 5) Performance and Accessibility

- Lighthouse sample checks (mobile + desktop) for key templates.
- Largest Contentful Paint sanity checks on image-heavy posts.
- Keyboard nav and heading hierarchy on main templates.

## 6) Go/No-Go for Production

- No critical broken pages.
- No critical image failures.
- No major SEO regressions.
- Cutover and rollback commands prepared and rehearsed.

## Current Execution Status (2026-04-23)

- [x] Astro build succeeds locally (`yarn build`).
- [x] Pages deployment succeeds (`blog-hichee-com`).
- [x] Root path returns `200` on `newblog.hichee.com`.
- [x] Sample migrated article paths return `200` on `newblog.hichee.com`.
- [x] `newblog.hichee.com` returns `200`.
- [x] Full generated-route HTTP sweep completed: 713 generated routes checked, with only intentional redirects.
- [x] Full media parity completed: 21,002 `/wp-content/*` keys checked with no final status or content-type regressions.
- [x] Mobile and desktop smoke checks passed for home, host page, author archives, legacy aliases, pagination, share controls, and media.
- [ ] Final DNS cutover is blocked until the old WordPress origin has a backup hostname and Pages production `LEGACY_MEDIA_ORIGIN` points to it.
