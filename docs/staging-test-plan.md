# Staging Test Plan (newblog.hichee.com)

Current preview deployment: `https://0c10c0d4.blog-hichee-com-git.pages.dev`  
Custom domain status: `newblog.hichee.com` pending DNS CNAME verification.

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

## Current Execution Status (2026-02-24)

- [x] Astro build succeeds locally (`yarn build`).
- [x] Pages deployment succeeds (`blog-hichee-com`).
- [x] Root path returns `200` on preview.
- [x] Sample migrated article paths return `200` on preview.
- [ ] `newblog.hichee.com` returns `200` (waiting for CNAME DNS record).
- [ ] Full SEO/asset QA sweep completed.
