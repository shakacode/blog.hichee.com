# Cloudflare Rollout

## Project Model

- One Cloudflare Pages project connected to `shakacode/blog.hichee.com`.
- Branch previews enabled for pull requests.
- Staging custom domain: `newblog.hichee.com`.
- Production custom domain: `blog.hichee.com`.

## Current Status (2026-04-23)

- Pages project created: `blog-hichee-com`.
- Project is Git-connected to `shakacode/blog.hichee.com` (Cloudflare Git Provider: Yes).
- Active production deployment source: `def69eb`.
- Active production deployment URL: `https://47bd19d6.blog-hichee-com-git.pages.dev`.
- Current Pages project domains: `blog-hichee-com-git.pages.dev`, `newblog.hichee.com`.
- `blog.hichee.com` is not attached to the Pages project yet.
- The Pages production config currently has `LEGACY_MEDIA_ORIGIN` set to an empty string.
- DNS-record inspection is not available through the current API token permissions, so clone the existing `blog.hichee.com` WordPress origin in the Cloudflare dashboard before cutover.

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
7. Create a backup hostname for the old WordPress origin, for example `oldblog.hichee.com`.
8. Verify the backup hostname serves the old WordPress site, including `/wp-content/*` media.
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
