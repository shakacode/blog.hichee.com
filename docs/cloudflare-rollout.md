# Cloudflare Rollout

## Project Model

- One Cloudflare Pages project connected to `shakacode/blog.hichee.com`.
- Branch previews enabled for pull requests.
- Staging custom domain: `newblog.hichee.com`.
- Production custom domain: `blog.hichee.com`.

## Current Status (2026-06-02)

- Pages project created: `blog-hichee-com`.
- Project is Git-connected to `shakacode/blog.hichee.com` (Cloudflare Git Provider: Yes).
- Current Pages project domains: `blog-hichee-com-git.pages.dev`, `newblog.hichee.com`.
- `blog.hichee.com` is not attached to the Pages project yet.
- Cloudways WordPress backup was archived to NAS at `/Volumes/justin-nas-files/hichee-archives/blog.hichee.com/2026-06-01-cloudways-wordpress-pre-cutover`.
- Backup hostname is live: `oldblog.hichee.com` resolves to Cloudways server `149.248.0.88`.
- Cloudways SSL certificate includes `DNS:blog.hichee.com` and `DNS:oldblog.hichee.com` and is valid through 2026-08-31.
- Representative legacy media returns `200` from `https://oldblog.hichee.com/wp-content/uploads/2022/08/Hichee.png`.
- `LEGACY_MEDIA_ORIGIN` is configured in `wrangler.jsonc` as `https://oldblog.hichee.com`.
- Remaining cutover gate: deploy this fallback config, verify production Pages, then attach/switch `blog.hichee.com` only after explicit final approval.

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
11. Promote by attaching/switching `blog.hichee.com` to this Pages project.
12. Verify and monitor.

## Notes

- If DNS is managed in the same Cloudflare account, CNAME creation can be automatic. If token/account permissions are limited, create the CNAME manually in dashboard DNS.
- For this project, deploys are now handled by Cloudflare Pages Git integration (not a custom GitHub Action deploy workflow).
- The actual cutover is attaching/switching `blog.hichee.com`; do not perform that step without final confirmation.

## Rollback

- Keep WordPress origin intact until stable after cutover.
- If critical issue appears, switch DNS/custom domain back to WordPress origin.
- Keep the WordPress backup hostname online until R2 media coverage is complete and enough production traffic has warmed the cache.
