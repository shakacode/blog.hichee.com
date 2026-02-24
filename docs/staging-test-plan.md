# Staging Test Plan (newblog.hichee.com)

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
