# Cloudflare Rollout

## Project Model

- One Cloudflare Pages project connected to `shakacode/blog.hichee.com`.
- Branch previews enabled for pull requests.
- Staging custom domain: `newblog.hichee.com`.
- Production custom domain: `blog.hichee.com`.

## Current Status (2026-06-02)

- Pages project created: `blog-hichee-com`.
- Project is Git-connected to `shakacode/blog.hichee.com` (Cloudflare Git Provider: Yes).
- Current Pages project domains: `blog-hichee-com-git.pages.dev`, `newblog.hichee.com`, `blog.hichee.com`.
- `blog.hichee.com` is attached to the Pages project and Cloudflare shows it as `Active` with `SSL enabled`.
- Cloudways WordPress backup was archived to NAS at `/Volumes/justin-nas-files/hichee-archives/blog.hichee.com/2026-06-01-cloudways-wordpress-pre-cutover`.
- Backup hostname is live: `oldblog.hichee.com` resolves to Cloudways server `149.248.0.88`.
- Cloudways SSL certificate includes `DNS:blog.hichee.com` and `DNS:oldblog.hichee.com` and is valid through 2026-08-31.
- `LEGACY_MEDIA_ORIGIN` is configured in `wrangler.jsonc` as `https://oldblog.hichee.com`.
- The `/wp-content` Pages Function serves deployed static assets first, then R2, then the legacy WordPress origin. This prevents a slow or unavailable WordPress origin from blocking media already shipped with the Pages deployment.
- Post-cutover route sweep: 713 generated routes checked between `newblog.hichee.com` and `blog.hichee.com`, with no status or redirect mismatches.
- Post-cutover media recovery: the 88 previously confirmed `/wp-content` 404s have been handled. 55 files were recovered into static `public/wp-content`, and 33 unrecoverable broken image references were removed from generated content. The archived Cloudways backup did not include those exact paths, so it remains rollback/archive insurance rather than the source for these recovered files.
- Generated-site external tagged image audit: 58 non-HiChee image URLs checked with 0 failures after removing 9 dead source-article embeds.

## Recommended Sequence

1. Create Pages project from GitHub repo.
2. Build settings:
   - Build command: `yarn build`
   - Output directory: `dist`
   - Node version: `22`
3. Attach `newblog.hichee.com` as custom domain.
4. Validate content, links, SEO, and media on staging.
5. Freeze WordPress edits.
6. Run final migration/export pass.
7. Create a backup hostname for the old WordPress origin, for example `oldblog.hichee.com`, using the same target as the current WordPress-backed `blog.hichee.com` DNS record. Completed 2026-06-02.
8. Verify the backup hostname serves `/wp-content/*` media directly. Completed 2026-06-02. The WordPress homepage still redirects to canonical `blog.hichee.com`, but media fallback is direct and valid.
9. Set Pages production variable `LEGACY_MEDIA_ORIGIN=https://oldblog.hichee.com` and redeploy.
10. Verify missing-media fallback on `newblog.hichee.com` after the redeploy.
11. Promote by attaching/switching `blog.hichee.com` to this Pages project. Completed 2026-06-02.
12. Verify and monitor. In progress after cutover; keep `oldblog.hichee.com` and the Cloudways application online for a short observation window before decommissioning WordPress.

## Notes

- If DNS is managed in the same Cloudflare account, CNAME creation can be automatic. If token/account permissions are limited, create the CNAME manually in dashboard DNS.
- For this project, deploys are now handled by Cloudflare Pages Git integration (not a custom GitHub Action deploy workflow).
- The actual cutover was attaching/switching `blog.hichee.com`; it was performed after explicit final confirmation on 2026-06-02.

## Rollback

- Keep WordPress origin intact until stable after cutover.
- If critical issue appears, switch DNS/custom domain back to WordPress origin.
- Keep the WordPress backup hostname online until R2 media coverage is complete and enough production traffic has warmed the cache.
- Keep the NAS archive at `/Volumes/justin-nas-files/hichee-archives/blog.hichee.com/2026-06-01-cloudways-wordpress-pre-cutover` until the static site has been stable long enough to decommission WordPress confidently.
