const WP_CONTENT_ORIGIN_PATTERN = /https?:\/\/blog\.hichee\.com(?=\/wp-content\/)/gi;
const TAG_WITH_LAZY_ATTRS_PATTERN = /<(img|source)\b[^>]*(data-lazy-src|data-lazy-srcset|data-lazy-sizes)[^>]*>/gi;

export function normalizeWpUploadUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return String(url).replace(WP_CONTENT_ORIGIN_PATTERN, '');
}

export function rewriteWpUploadsInHtml(html: string): string {
  if (!html) return '';

  const normalizedOrigins = html.replace(WP_CONTENT_ORIGIN_PATTERN, '');
  return normalizedOrigins.replace(TAG_WITH_LAZY_ATTRS_PATTERN, (tag) => promoteLazyMediaAttrs(tag));
}

function promoteLazyMediaAttrs(tag: string): string {
  let updated = tag;

  updated = moveLazyAttr(updated, 'data-lazy-srcset', 'srcset');
  updated = moveLazyAttr(updated, 'data-lazy-sizes', 'sizes');
  updated = moveLazyAttr(updated, 'data-lazy-src', 'src');

  return updated.replace(/\sclass=(["'])([^"']*)\1/i, (_full, quote, classValue) => {
    const cleaned = classValue
      .split(/\s+/)
      .filter((token) => token && token !== 'rocket-lazyload' && token !== 'lazyloading' && token !== 'lazyloaded')
      .join(' ');

    return cleaned ? ` class=${quote}${cleaned}${quote}` : '';
  });
}

function moveLazyAttr(tag: string, lazyAttr: string, realAttr: string): string {
  const lazyPattern = new RegExp(`\\s${lazyAttr}=(["'])(.*?)\\1`, 'i');
  const lazyMatch = tag.match(lazyPattern);
  if (!lazyMatch) return tag;

  const quote = lazyMatch[1];
  const value = lazyMatch[2];
  const realPattern = new RegExp(`\\s${realAttr}=(["']).*?\\1`, 'i');

  let updated = tag.replace(lazyPattern, '');
  if (realPattern.test(updated)) {
    updated = updated.replace(realPattern, ` ${realAttr}=${quote}${value}${quote}`);
  } else {
    updated = updated.replace(/>$/, ` ${realAttr}=${quote}${value}${quote}>`);
  }

  return updated;
}
