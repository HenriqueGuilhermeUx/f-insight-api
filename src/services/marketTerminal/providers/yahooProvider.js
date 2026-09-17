'use strict';

const axios = require('axios');

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function symbolVariants(symbol) {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) return [];
  const withoutSuffix = clean.replace(/\.SA$/i, '');
  return [...new Set([clean, `${withoutSuffix}.SA`, withoutSuffix])];
}

function normalizeChart(symbol, providerSymbol, result) {
  const quote = result?.indicators?.quote?.[0] || {};
  const timestamps = result?.timestamp || [];
  const closes = quote.close || [];
  const rows = timestamps.map((timestamp, index) => ({
    timestamp,
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    open: Number.isFinite(quote.open?.[index]) ? quote.open[index] : null,
    high: Number.isFinite(quote.high?.[index]) ? quote.high[index] : null,
    low: Number.isFinite(quote.low?.[index]) ? quote.low[index] : null,
    close: Number.isFinite(closes[index]) ? closes[index] : null,
    volume: Number.isFinite(quote.volume?.[index]) ? quote.volume[index] : null,
  })).filter((row) => row.close !== null);

  return {
    symbol,
    provider: 'yahoo',
    providerSymbol,
    currency: result?.meta?.currency || null,
    exchange: result?.meta?.exchangeName || null,
    fetchedAt: new Date().toISOString(),
    rows,
    last: rows.length ? rows[rows.length - 1] : null,
  };
}

async function getHistoricalPrices(symbol, options = {}) {
  const range = options.range || '1y';
  const interval = options.interval || '1d';
  const errors = [];

  for (const variant of symbolVariants(symbol)) {
    try {
      const response = await axios.get(`${BASE_URL}/${encodeURIComponent(variant)}`, {
        params: { range, interval, events: 'div,splits' },
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 F-Insight-Research/1.0' },
      });
      const result = response.data?.chart?.result?.[0];
      if (!result) throw new Error('empty chart result');
      const normalized = normalizeChart(symbol, variant, result);
      if (!normalized.rows.length) throw new Error('empty historical rows');
      return normalized;
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
    }
  }

  throw new Error(`Yahoo historical data unavailable for ${symbol}. ${errors.join(' | ')}`);
}

module.exports = {
  getHistoricalPrices,
  symbolVariants,
};
