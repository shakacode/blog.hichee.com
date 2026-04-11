const CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return context.next();
  }

  const url = new URL(request.url);
  const key = url.pathname.replace(/^\//, '');
  const object = await env.BLOG_MEDIA.get(key);

  if (!object) {
    const fallbackOrigin = resolveFallbackOrigin(url, env.LEGACY_MEDIA_ORIGIN);
    if (fallbackOrigin) {
      const fallbackResponse = await fetch(`${fallbackOrigin}${url.pathname}${url.search}`, {
        method: request.method
      });

      if (fallbackResponse.ok) {
        if (request.method === 'GET') {
          const responseToCache = fallbackResponse.clone();
          context.waitUntil(cacheObject(env.BLOG_MEDIA, key, responseToCache));
        }

        return fallbackResponse;
      }
    }

    return env.ASSETS.fetch(request);
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

function resolveFallbackOrigin(url, legacyMediaOrigin) {
  if (url.hostname !== 'blog.hichee.com') {
    return 'https://blog.hichee.com';
  }

  const normalized = String(legacyMediaOrigin || '').trim().replace(/\/$/, '');
  return normalized || null;
}

async function cacheObject(bucket, key, response) {
  try {
    await bucket.put(key, await response.arrayBuffer());
  } catch (error) {
    console.error(`Failed to cache ${key} in R2`, error);
  }
}

function guessContentType(key) {
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
