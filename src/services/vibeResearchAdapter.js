'use strict';

const MAX_BODY_BYTES = 512 * 1024;
const TIMEOUT_MS = 6500;

function validateBaseUrl(raw) {
  if (!raw) throw new Error('VIBE_RESEARCH_BASE_URL_NOT_CONFIGURED');
  const url = new URL(raw);
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('INVALID_VIBE_RESEARCH_BASE_URL');
  }
  return url;
}

async function requestReadOnly(path, options = {}) {
  const base = validateBaseUrl(options.baseUrl || process.env.VIBE_RESEARCH_BASE_URL);
  const relative = String(path);
  if (!/^\/alpha\/(?:list|[a-zA-Z0-9_.-]{1,90})$/.test(relative)) {
    throw new Error('DISALLOWED_RESEARCH_ROUTE');
  }
  const target = new URL(relative, base);
  const fetcher = options.fetcher || fetch;
  const apiKey = options.apiKey ?? process.env.VIBE_RESEARCH_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(target.toString(), {
      method: 'GET',
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' } : { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('VIBE_UPSTREAM_STATUS_' + response.status);
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('application/json')) throw new Error('VIBE_NOT_JSON');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) throw new Error('VIBE_RESPONSE_TOO_LARGE');
    const content = await response.text();
    if (Buffer.byteLength(content, 'utf8') > MAX_BODY_BYTES) throw new Error('VIBE_RESPONSE_TOO_LARGE');
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

function listAlphas(options) {
  return requestReadOnly('/alpha/list', options);
}

function alphaMetadata(alphaId, options) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,89}$/.test(String(alphaId))) throw new Error('INVALID_ALPHA_ID');
  return requestReadOnly('/alpha/' + alphaId, options);
}

module.exports = { listAlphas, alphaMetadata, validateBaseUrl };
