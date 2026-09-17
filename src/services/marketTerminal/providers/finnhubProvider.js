'use strict';

const BASE_URL = process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1';

function isEnabled() {
  return Boolean(process.env.FINNHUB_API_KEY);
}

async function fetchJson(path, params = {}, timeoutMs = 10000) {
  if (!isEnabled()) throw new Error('FINNHUB_API_KEY is not configured');

  const url = new URL(`${BASE_URL}${path}`);
  Object.entries({ ...params, token: process.env.FINNHUB_API_KEY }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getQuote(symbol) {
  const raw = await fetchJson('/quote', { symbol });
  return {
    provider: 'finnhub',
    symbol,
    price: Number(raw.c || 0),
    change: Number(raw.d || 0),
    changePercent: Number(raw.dp || 0),
    high: Number(raw.h || 0),
    low: Number(raw.l || 0),
    open: Number(raw.o || 0),
    previousClose: Number(raw.pc || 0),
    timestamp: raw.t ? new Date(Number(raw.t) * 1000).toISOString() : null,
    raw,
  };
}

async function searchSymbol(query) {
  const raw = await fetchJson('/search', { q: query });
  return {
    provider: 'finnhub',
    query,
    count: Number(raw.count || 0),
    results: Array.isArray(raw.result) ? raw.result : [],
  };
}

async function getCompanyNews(symbol, from, to) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const raw = await fetchJson('/company-news', { symbol, from: start, to: end });
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item) => ({
    provider: 'finnhub',
    id: item.id || item.url,
    symbol,
    headline: item.headline || '',
    summary: item.summary || '',
    source: item.source || '',
    url: item.url || '',
    category: item.category || '',
    publishedAt: item.datetime ? new Date(Number(item.datetime) * 1000).toISOString() : null,
    related: item.related || symbol,
  }));
}

module.exports = {
  isEnabled,
  getQuote,
  searchSymbol,
  getCompanyNews,
};
