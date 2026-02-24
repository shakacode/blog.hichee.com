# Cloudflare Rollout

## Project Model

- One Cloudflare Pages project connected to `shakacode/blog.hichee.com`.
- Branch previews enabled for pull requests.
- Staging custom domain: `newblog.hichee.com`.
- Production custom domain: `blog.hichee.com`.

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

## Rollback

- Keep WordPress origin intact until stable after cutover.
- If critical issue appears, switch DNS/custom domain back to WordPress origin.
