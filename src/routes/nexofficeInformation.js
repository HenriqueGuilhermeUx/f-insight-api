'use strict';

const crypto = require('crypto');
const express = require('express');
const { getCachedNews, getCachedIndicators } = require('../services/liveDataService');
const { getMacroData } = require('../services/macroService');
const { calculate, calculators } = require('../services/financialCalculators');
const { dataSupabase: supabase, isDataSupabaseEnabled } = require('../services/dataSupabaseClient');

const router = express.Router();
const REQUESTS_PER_MINUTE = 120;
const buckets = new Map();

function policy() {
  return {
    informationOnly: true,
    recommendation: false,
    execution: false,
    ranking: false,
    buySellSignal: false,
    portfolioAdvice: false,
    advisorClientData: false,
  };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validWorkspaceId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function requireNexOffice(req, res, next) {
  if (process.env.NEXOFFICE_INFORMATION_BRIDGE_ENABLED !== 'true') {
    return res.status(503).json({ ok: false, error: 'nexoffice_information_bridge_disabled', policy: policy() });
  }

  const expected = String(process.env.FINSIGHT_NEXOFFICE_SERVICE_KEY || '').trim();
  const supplied = String(req.get('X-NexOffice-Key') || '').trim();
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'nexoffice_information_bridge_not_configured', policy: policy() });
  }
  if (!safeEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: 'invalid_nexoffice_service_key', policy: policy() });
  }

  const workspaceId = String(req.get('X-NexOffice-Workspace-ID') || '').trim();
  if (!validWorkspaceId(workspaceId)) {
    return res.status(400).json({ ok: false, error: 'invalid_nexoffice_workspace_id', policy: policy() });
  }

  const minute = Math.floor(Date.now() / 60000);
  const bucketKey = `${workspaceId}:${minute}`;
  const used = (buckets.get(bucketKey) || 0) + 1;
  buckets.set(bucketKey, used);
  if (buckets.size > 2000) {
    for (const key of buckets.keys()) {
      const keyMinute = Number(key.split(':').at(-1));
      if (keyMinute < minute - 2) buckets.delete(key);
    }
  }
  if (used > REQUESTS_PER_MINUTE) {
    return res.status(429).json({ ok: false, error: 'nexoffice_rate_limit_exceeded', policy: policy() });
  }

  req.nexoffice = { workspaceId };
  return next();
}

function cleanSymbols(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(input
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => /^[A-Z0-9.^-]{1,24}$/.test(item)))]
    .slice(0, 24);
}

function sanitizeIndicator(row) {
  const price = Number(row?.lastPrice ?? row?.last_price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const fetchedAt = row?.fetchedAt || row?.fetched_at || null;
  return {
    symbol: String(row?.symbol || '').toUpperCase(),
    provider: row?.provider ? String(row.provider) : null,
    lastPrice: price,
    change: Number.isFinite(Number(row?.change)) ? Number(row.change) : 0,
    changePercent: Number.isFinite(Number(row?.changePercent ?? row?.change_percent)) ? Number(row?.changePercent ?? row?.change_percent) : 0,
    avgVolume: Number.isFinite(Number(row?.avgVolume ?? row?.avg_volume)) ? Number(row?.avgVolume ?? row?.avg_volume) : 0,
    fetchedAt,
  };
}

async function readSnapshots(symbols) {
  const requested = cleanSymbols(symbols);
  if (isDataSupabaseEnabled()) {
    try {
      let query = supabase
        .from('market_indicator_snapshots')
        .select('symbol,provider,last_price,change,change_percent,avg_volume,fetched_at')
        .order('fetched_at', { ascending: false })
        .limit(Math.max(requested.length * 4, 40));
      if (requested.length) query = query.in('symbol', requested);
      const { data, error } = await query;
      if (error) throw error;
      const unique = new Map();
      for (const row of data || []) {
        const clean = sanitizeIndicator(row);
        if (clean && !unique.has(clean.symbol)) unique.set(clean.symbol, clean);
      }
      if (unique.size) return { source: 'supabase-cache', data: [...unique.values()] };
    } catch (error) {
      console.warn('NexOffice bridge could not read persisted indicator cache:', error.message);
    }
  }

  const runtime = getCachedIndicators(requested)
    .map(sanitizeIndicator)
    .filter(Boolean);
  return { source: runtime.length ? 'runtime-cache' : 'unavailable', data: runtime };
}

function freshness(rows) {
  const times = rows
    .map((row) => new Date(row?.fetchedAt || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);
  const latest = times.length ? Math.max(...times) : null;
  return {
    dataUpdatedAt: latest ? new Date(latest).toISOString() : null,
    dataAgeSeconds: latest ? Math.max(0, Math.floor((Date.now() - latest) / 1000)) : null,
    responseAt: new Date().toISOString(),
  };
}

router.use(requireNexOffice);

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'finsight-nexoffice-information-v1',
    workspaceId: req.nexoffice.workspaceId,
    capabilities: ['radar', 'asset_snapshot', 'macro_context', 'news', 'educational_calculations'],
    excludedCapabilities: ['allocation_signals', 'recommendations', 'orders', 'execution', 'portfolio_advice', 'advisor_clients', 'professional_crm', 'quant_lab'],
    calculators: Object.keys(calculators),
    policy: policy(),
  });
});

router.get('/radar', async (req, res) => {
  const symbols = cleanSymbols(req.query.symbols);
  if (!symbols.length) {
    return res.status(400).json({ ok: false, error: 'symbols_required', policy: policy() });
  }
  const result = await readSnapshots(symbols);
  const bySymbol = new Map(result.data.map((item) => [item.symbol, item]));
  const data = symbols.map((symbol) => bySymbol.get(symbol) || { symbol, available: false });
  return res.json({
    ok: true,
    workspaceId: req.nexoffice.workspaceId,
    source: result.source,
    ...freshness(result.data),
    data,
    policy: policy(),
  });
});

router.get('/assets/:symbol', async (req, res) => {
  const symbols = cleanSymbols([req.params.symbol]);
  if (!symbols.length) return res.status(400).json({ ok: false, error: 'invalid_symbol', policy: policy() });
  const result = await readSnapshots(symbols);
  const asset = result.data.find((item) => item.symbol === symbols[0]) || null;
  return res.status(asset ? 200 : 404).json({
    ok: Boolean(asset),
    workspaceId: req.nexoffice.workspaceId,
    source: result.source,
    ...freshness(result.data),
    asset,
    error: asset ? undefined : 'asset_snapshot_unavailable',
    policy: policy(),
  });
});

router.get('/macro', async (req, res) => {
  const macro = await getMacroData({ force: false });
  const indicators = Array.isArray(macro?.indicators) ? macro.indicators : [];
  const observations = Array.isArray(macro?.observations) ? macro.observations : [];
  return res.json({
    ok: indicators.length > 0,
    workspaceId: req.nexoffice.workspaceId,
    source: macro?.source || 'unavailable',
    updatedAt: macro?.updatedAt || null,
    degraded: Boolean(macro?.degraded),
    failures: Array.isArray(macro?.failures) ? macro.failures : [],
    indicators,
    observations,
    policy: policy(),
  });
});

router.get('/news', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '12'), 10) || 12, 1), 30);
  const category = String(req.query.category || 'all').trim().toLowerCase();
  const news = await getCachedNews(limit, category);
  const data = (news || []).map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    summary: String(item.summary || ''),
    source: String(item.source || ''),
    url: String(item.url || ''),
    publishedAt: item.publishedAt || null,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
  }));
  const timestamps = data.map((item) => new Date(item.publishedAt || 0).getTime()).filter((value) => Number.isFinite(value) && value > 0);
  return res.json({
    ok: true,
    workspaceId: req.nexoffice.workspaceId,
    source: data.length ? 'finsight-news-cache' : 'unavailable',
    latestPublishedAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    responseAt: new Date().toISOString(),
    data,
    policy: policy(),
  });
});

router.post('/calculate', (req, res) => {
  try {
    const type = String(req.body?.type || '').trim();
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    const result = calculate(type, input);
    return res.json({
      ok: true,
      workspaceId: req.nexoffice.workspaceId,
      result,
      methodology: {
        deterministic: true,
        externalMarketDataUsed: false,
        inputsProvidedByCaller: true,
      },
      policy: policy(),
    });
  } catch (error) {
    const clientError = ['invalid_number', 'invalid_range', 'unsupported_calculation'].includes(error.code);
    return res.status(clientError ? 400 : 500).json({
      ok: false,
      error: error.code || 'calculation_failed',
      message: error.message,
      policy: policy(),
    });
  }
});

module.exports = router;
