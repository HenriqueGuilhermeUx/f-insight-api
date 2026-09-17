'use strict';

function config() {
  return {
    baseUrl: String(process.env.OPENBB_BASE_URL || '').replace(/\/$/, ''),
    provider: process.env.OPENBB_PROVIDER || 'yfinance',
    historicalPath: process.env.OPENBB_HISTORICAL_PATH || '/api/v1/equity/price/historical',
  };
}

function isEnabled() {
  return Boolean(config().baseUrl);
}

async function fetchJson(path, params = {}, timeoutMs = 15000) {
  const cfg = config();
  if (!cfg.baseUrl) throw new Error('OPENBB_BASE_URL is not configured');

  const url = new URL(`${cfg.baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`OpenBB HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapResults(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

async function getHistoricalPrices(symbol, options = {}) {
  const cfg = config();
  const raw = await fetchJson(cfg.historicalPath, {
    symbol,
    provider: options.provider || cfg.provider,
    start_date: options.startDate,
    end_date: options.endDate,
    interval: options.interval || '1d',
  });

  return {
    provider: `openbb:${options.provider || cfg.provider}`,
    symbol,
    rows: unwrapResults(raw),
    raw,
  };
}

module.exports = {
  config,
  isEnabled,
  getHistoricalPrices,
};
