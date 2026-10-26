'use strict';

const { isIP } = require('node:net');

const MAX_BODY_BYTES = 512 * 1024;
const TIMEOUT_MS = 6500;

function validateBaseUrl(raw) {
  if (!raw) throw new Error('VIBE_RESEARCH_BASE_URL_NOT_CONFIGURED');
  let url;
  try { url = new URL(raw); } catch { throw new Error('INVALID_VIBE_RESEARCH_BASE_URL'); }
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(localhost && url.protocol === 'http:' &&
      process.env.NODE_ENV !== 'production')) ||
      url.username || url.password || url.search || url.hash ||
      !['', '/'].includes(url.pathname)) {
    throw new Error('INVALID_VIBE_RESEARCH_BASE_URL');
  }
  const strict = process.env.NODE_ENV === 'production' ||
    process.env.VIBE_RESEARCH_STRICT_EGRESS === 'true';
  if (strict) {
    const approved = process.env.VIBE_RESEARCH_ALLOWED_ORIGIN;
    if (!approved) throw new Error('VIBE_RESEARCH_ALLOWED_ORIGIN_REQUIRED');
    let allowUrl;
    try { allowUrl = new URL(approved); } catch {
      throw new Error('INVALID_VIBE_RESEARCH_ALLOWED_ORIGIN');
    }
    // Reject loopback, internal suffixes and numeric hosts. Only an explicit
    // HTTPS DNS origin may be pinned. DNS/network isolation remains an infra task.
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || allowUrl.protocol !== 'https:' ||
        host === 'localhost' || isIP(host) !== 0 ||
        host.startsWith('[') || !host.includes('.') ||
        // A trailing DNS root dot can bypass checks for .internal/.local,
        // and should never appear in a pinned research-service origin.
        host.endsWith('.') || host.startsWith('.') || host.includes('..') ||
        ['.local', '.localhost', '.internal', '.invalid'].some((suffix) => host.endsWith(suffix)) ||
        allowUrl.username || allowUrl.password || allowUrl.search || allowUrl.hash ||
        allowUrl.pathname !== '/' || url.origin !== allowUrl.origin) {
      throw new Error('VIBE_RESEARCH_ORIGIN_NOT_ALLOWED');
    }
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
  if (relative === '/alpha/list') {
    const filters = validateVibeListFilters(options.filters || {});
    if (filters.universe) target.searchParams.set('universe', filters.universe);
    if (filters.zoo) target.searchParams.set('zoo', filters.zoo);
    if (filters.limit) target.searchParams.set('limit', String(filters.limit));
  } else if (options.filters !== undefined) {
    throw new Error('DISALLOWED_RESEARCH_FILTER');
  }
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
    // Enforce the bound while streaming, even if upstream omits Content-Length.
    // Avoid loading an arbitrarily large remote response before checking its size.
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES) {
            await reader.cancel().catch(() => {});
            throw new Error('VIBE_RESPONSE_TOO_LARGE');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks.map((v) => Buffer.from(v)), size).toString('utf8'));
    }
    const content = await response.text();
    if (Buffer.byteLength(content, 'utf8') > MAX_BODY_BYTES) throw new Error('VIBE_RESPONSE_TOO_LARGE');
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

const ALPHA_ID = /^[a-z][a-z0-9]+_[a-z0-9_]{1,64}$/;
const VIBE_UNIVERSES = new Set(['equity_us', 'crypto']);
const VIBE_ZOOS = new Set(['alpha101', 'gtja191', 'qlib158', 'academic', 'fundamental']);

function validateVibeListFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) ||
      Object.keys(filters).some((key) => !['universe', 'zoo', 'limit'].includes(key))) {
    throw new Error('VIBE_INVALID_FILTERS');
  }
  const universe = filters.universe;
  const zoo = filters.zoo;
  const limit = filters.limit === undefined ? undefined : Number(filters.limit);
  if ((universe !== undefined && (typeof universe !== 'string' || !VIBE_UNIVERSES.has(universe))) ||
      (zoo !== undefined && (typeof zoo !== 'string' || !VIBE_ZOOS.has(zoo))) ||
      (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100))) {
    throw new Error('VIBE_INVALID_FILTERS');
  }
  return { universe, zoo, limit };
}


function shortString(value, limit = 160) {
  return typeof value === 'string' ? value.slice(0, limit) : null;
}

function safeStringList(value) {
  return Array.isArray(value)
    ? value.filter((x) => typeof x === 'string').slice(0, 24).map((x) => x.slice(0, 80))
    : [];
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function projectAlphaSummary(alpha) {
  if (!alpha || typeof alpha !== 'object' || !ALPHA_ID.test(alpha.id || '')) {
    return null;
  }
  return {
    id: alpha.id,
    zoo: shortString(alpha.zoo, 64),
    theme: safeStringList(alpha.theme),
    universe: safeStringList(alpha.universe),
    nickname: shortString(alpha.nickname),
    decayHorizon: safeNumber(alpha.decay_horizon),
    minWarmupBars: safeNumber(alpha.min_warmup_bars),
    requiresSector: alpha.requires_sector === true,
  };
}

/**
 * This adapter intentionally never forwards Python source_code, module_path,
 * arbitrary metadata, or prompts from the upstream open-source service.
 */
async function listAlphas(options) {
  const data = await requestReadOnly('/alpha/list', options);
  if (data?.status !== 'ok' || !Array.isArray(data.alphas)) {
    throw new Error('VIBE_UNEXPECTED_RESPONSE_SHAPE');
  }
  return {
    alphas: data.alphas.slice(0, 100).map(projectAlphaSummary).filter(Boolean),
    total: safeNumber(data.total),
    truncated: data.truncated === true || data.alphas.length > 100,
  };
}

/**
 * Read-only capability probe. Does not check credentials by attempting to
 * submit benchmarks or start trading. The provider publishes readiness for
 * supported backtest universes; this is NOT a guarantee of market data quality.
 */
async function researchReadiness(options) {
  const data = await requestReadOnly('/alpha/readiness', options);
  if (!data || typeof data !== 'object' ||
      !data.universes || typeof data.universes !== 'object') {
    throw new Error('VIBE_UNEXPECTED_READINESS_SHAPE');
  }
  const us = data.universes.sp500 || {};
  const crypto = data.universes['btc-usdt'] || {};
  return {
    mode: 'read-only',
    orderExecutionEnabled: false,
    usEquityBacktestConfigured: us.ready === true,
    cryptoCrossSectionalBacktestConfigured: crypto.ready === true,
    checkedFromProvider: true,
    // A provider readiness boolean is only a configuration preflight,
    // never proof of data freshness, trades or backtest validity.
    dataFreshnessVerified: false,
  };
}

async function alphaMetadata(alphaId, options) {
  if (!ALPHA_ID.test(String(alphaId))) throw new Error('INVALID_ALPHA_ID');
  const data = await requestReadOnly('/alpha/' + alphaId, options);
  if (data?.status !== 'ok' || !data.alpha || data.alpha.id !== alphaId) {
    throw new Error('VIBE_UNEXPECTED_RESPONSE_SHAPE');
  }
  const alpha = data.alpha;
  const meta = alpha.meta && typeof alpha.meta === 'object' ? alpha.meta : {};
  return {
    id: alphaId,
    zoo: shortString(alpha.zoo, 64),
    theme: safeStringList(meta.theme),
    universe: safeStringList(meta.universe),
    nickname: shortString(meta.nickname),
    decayHorizon: safeNumber(meta.decay_horizon),
    minWarmupBars: safeNumber(meta.min_warmup_bars),
    requiresSector: meta.requires_sector === true,
    researchOnly: true,
    sourceCodeIncluded: false,
  };
}

module.exports = { listAlphas, alphaMetadata, researchReadiness, validateBaseUrl, validateVibeListFilters };
