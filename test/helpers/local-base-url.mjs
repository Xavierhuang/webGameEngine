const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Fail before a browser or fetch can touch any non-local deployment. */
export function assertLocalBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid local base URL: ${raw}`);
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing non-loopback test target: ${url.origin}`);
  }
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`Local test base must be a bare origin: ${raw}`);
  }
  return url.origin;
}
