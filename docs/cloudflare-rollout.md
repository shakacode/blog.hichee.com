# Cloudflare Rollout

## Project Model

- One Cloudflare Pages project connected to `shakacode/blog.hichee.com`.
- Branch previews enabled for pull requests.
- Staging custom domain: `newblog.hichee.com`.
- Production custom domain: `blog.hichee.com`.

## Current Status (2026-02-24)

- Pages project created: `blog-hichee-com`.
- Initial deployment completed: `https://3d57ea96.blog-hichee-com.pages.dev`.
- Staging custom domain `newblog.hichee.com` added to project but still pending verification.
- Pending DNS step: create CNAME record `newblog -> blog-hichee-com.pages.dev` in `hichee.com` zone.

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
7. Promote by attaching/switching `blog.hichee.com` to this Pages project.
8. Verify and monitor.

## Notes

- If DNS is managed in the same Cloudflare account, CNAME creation can be automatic. If token/account permissions are limited, create the CNAME manually in dashboard DNS.
- GitHub Actions workflow `.github/workflows/deploy-pages.yml` handles push/PR deploys once `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set.

## Rollback

- Keep WordPress origin intact until stable after cutover.
- If critical issue appears, switch DNS/custom domain back to WordPress origin.
