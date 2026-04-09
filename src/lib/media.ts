const WP_CONTENT_ORIGIN_PATTERN = /https?:\/\/blog\.hichee\.com(?=\/wp-content\/)/gi;

export function normalizeWpUploadUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return String(url).replace(WP_CONTENT_ORIGIN_PATTERN, '');
}

export function rewriteWpUploadsInHtml(html: string): string {
  if (!html) return '';
  return html.replace(WP_CONTENT_ORIGIN_PATTERN, '');
}
