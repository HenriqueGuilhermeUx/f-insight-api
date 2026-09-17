'use strict';

const DEFAULT_WEIGHTS = {
  news: 0.45,
  reddit: 0.20,
  x: 0.20,
  prediction: 0.15,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeScore(value) {
  const score = numeric(value, 0);
  if (score >= -1 && score <= 1) return score;
  if (score >= 0 && score <= 100) return (score - 50) / 50;
  return clamp(score, -1, 1);
}

function average(items = []) {
  const valid = items
    .map((item) => normalizeScore(typeof item === 'number' ? item : item?.score))
    .filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function label(score) {
  if (score === null || score === undefined) return 'sem-dados';
  if (score >= 0.35) return 'positivo-forte';
  if (score >= 0.10) return 'positivo';
  if (score <= -0.35) return 'negativo-forte';
  if (score <= -0.10) return 'negativo';
  return 'neutro';
}

function aggregateSentiment(payload = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(payload.weights || {}) };
  const channels = {
    news: average(payload.news),
    reddit: average(payload.reddit),
    x: average(payload.x),
    prediction: average(payload.prediction),
  };

  let weightedSum = 0;
  let activeWeight = 0;
  Object.entries(channels).forEach(([channel, score]) => {
    if (score === null) return;
    const weight = numeric(weights[channel], 0);
    weightedSum += score * weight;
    activeWeight += weight;
  });

  const score = activeWeight > 0 ? clamp(weightedSum / activeWeight, -1, 1) : null;
  return {
    score,
    score100: score === null ? null : Math.round((score + 1) * 50),
    label: label(score),
    channels: Object.fromEntries(Object.entries(channels).map(([key, value]) => [key, {
      score: value,
      label: label(value),
      weight: weights[key],
    }])),
    methodology: 'Weighted aggregation of normalized channel sentiment; internal research signal only.',
  };
}

function adanosConfig() {
  return {
    baseUrl: String(process.env.ADANOS_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.ADANOS_API_KEY || '',
    stockPath: process.env.ADANOS_STOCK_SENTIMENT_PATH || '',
  };
}

function isAdanosEnabled() {
  const cfg = adanosConfig();
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.stockPath);
}

async function getAdanosStockSentiment(symbol, timeoutMs = 12000) {
  const cfg = adanosConfig();
  if (!isAdanosEnabled()) throw new Error('Adanos provider is not fully configured');

  const url = new URL(`${cfg.baseUrl}${cfg.stockPath}`);
  url.searchParams.set('symbol', symbol);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!response.ok) throw new Error(`Adanos HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_WEIGHTS,
  aggregateSentiment,
  adanosConfig,
  isAdanosEnabled,
  getAdanosStockSentiment,
};
