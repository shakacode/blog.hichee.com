const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';
const CONTENT_TYPE_OVERRIDES = new Map([
  ['wp-content/uploads/2022/08/Copy-of-Dont-give-up-the-daydream-700-', 'image/png'],
  ['wp-content/uploads/2022/08/Dont-give-up-the-daydream-700-', 'image/jpeg'],
  ['wp-content/uploads/2022/09/Copy-of-Dont-give-up-the-daydream-700-', 'image/png'],
  ['wp-content/uploads/2022/12/Copy-of-Dont-give-up-the-daydream-700-', 'image/png'],
  ['wp-content/uploads/2023/01/Im-pregnant-', 'image/jpeg'],
  ['wp-content/uploads/2023/03/Copy-of-Dont-give-up-the-daydream-700-', 'image/png'],
  ['wp-content/uploads/2023/05/Smart-Home-Devices-For-Your-Airbnb-', 'image/jpeg'],
  ['wp-content/uploads/2023/05/Smart-Home-Security-Devices-For-Your-Airbnb-', 'image/jpeg'],
  ['wp-content/uploads/2023/11/Untitled-150-', 'image/png'],
  ['wp-content/uploads/2023/12/The-Common-Room', 'image/gif'],
  ['wp-content/uploads/2024/02/DALL', 'image/webp']
]);

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return context.next();
  }

  const url = new URL(request.url);
  const key = url.pathname.replace(/^\//, '');
  const assetResponse = await env.ASSETS.fetch(request);

  if (assetResponse.status !== 404) {
    return withContentTypeOverride(assetResponse, key);
  }

  const object = await env.BLOG_MEDIA.get(key);

  if (!object) {
    const fallbackOrigin = resolveFallbackOrigin(url, env.LEGACY_MEDIA_ORIGIN);
    if (fallbackOrigin) {
      const fallbackResponse = await fetchWithTimeout(`${fallbackOrigin}${url.pathname}${url.search}`, {
        method: request.method
      });

      if (fallbackResponse?.ok) {
        if (request.method === 'GET') {
          const responseToCache = fallbackResponse.clone();
          context.waitUntil(cacheObject(env.BLOG_MEDIA, key, responseToCache));
        }

        return fallbackResponse;
      }
    }

    return assetResponse;
  }

  const headers = new Headers();

  if (typeof object.writeHttpMetadata === 'function') {
    object.writeHttpMetadata(headers);
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', guessContentType(key));
  }

  if (!headers.has('cache-control')) {
    headers.set('cache-control', CACHE_CONTROL);
  }

  if (object.httpEtag) {
    headers.set('etag', object.httpEtag);
  }

  if (Number.isFinite(object.size)) {
    headers.set('content-length', String(object.size));
  }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers
  });
}

function withContentTypeOverride(response, key) {
  const contentType = guessContentType(key);
  if (contentType === 'application/octet-stream') return response;

  const currentContentType = response.headers.get('content-type');
  if (currentContentType && currentContentType !== 'application/octet-stream') return response;

  const headers = new Headers(response.headers);
  headers.set('content-type', contentType);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function resolveFallbackOrigin(url, legacyMediaOrigin) {
  const normalized = String(legacyMediaOrigin || '').trim().replace(/\/$/, '');
  if (normalized) return normalized;

  if (url.hostname !== 'blog.hichee.com') {
    return 'https://blog.hichee.com';
  }

  return null;
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheObject(bucket, key, response) {
  try {
    await bucket.put(key, await response.arrayBuffer());
  } catch (error) {
    console.error(`Failed to cache ${key} in R2`, error);
  }
}

function guessContentType(key) {
  const override = CONTENT_TYPE_OVERRIDES.get(key.replace(/^\//, ''));
  if (override) return override;

  const lower = key.toLowerCase();

  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';

  return 'application/octet-stream';
}
