const express = require('express');
const router = express.Router();
const {
  DEFAULT_SYMBOLS,
  getLiveStatus,
  getCachedIndicators,
  refreshIndicators,
  refreshMacroAndPersist,
  refreshNews,
} = require('../services/liveDataService');
const { dataSupabase: supabase, isDataSupabaseEnabled: isSupabaseEnabled } = require('../services/dataSupabaseClient');

function mapIndicatorRow(row) {
  return {
    symbol: row.symbol,
    provider: row.provider,
    lastPrice: Number(row.last_price || 0),
    change: Number(row.change || 0),
    changePercent: Number(row.change_percent || 0),
    avgVolume: Number(row.avg_volume || 0),
    candles: row.candles || {},
    fetchedAt: row.fetched_at,
  };
}

function freshness(data = []) {
  const times = data
    .map((item) => new Date(item?.fetchedAt || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);
  const latest = times.length ? Math.max(...times) : null;
  return {
    responseAt: new Date().toISOString(),
    dataUpdatedAt: latest ? new Date(latest).toISOString() : null,
    dataAgeSeconds: latest ? Math.max(0, Math.floor((Date.now() - latest) / 1000)) : null,
  };
}

function indicatorResponse(source, data, extra = {}) {
  return {
    source,
    count: data.length,
    ...freshness(data),
    ...extra,
    data,
  };
}

router.get('/status', async (req, res) => {
  try {
    res.json(await getLiveStatus());
  } catch (error) {
    console.error('Live status failed:', error.message);
    res.status(500).json({ error: 'Failed to get live status' });
  }
});

router.get('/indicators', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (isSupabaseEnabled()) {
    try {
      let query = supabase
        .from('market_indicator_snapshots')
        .select('symbol,provider,last_price,change,change_percent,avg_volume,candles,fetched_at')
        .order('fetched_at', { ascending: false });

      if (symbols.length > 0) query = query.in('symbol', symbols);

      const { data, error } = await query;
      if (error) throw error;

      const unique = Array.from(
        new Map((data || []).map((row) => [row.symbol, mapIndicatorRow(row)])).values()
      ).filter((item) => Number.isFinite(item.lastPrice) && item.lastPrice > 0);

      if (unique.length > 0) {
        return res.json(indicatorResponse('supabase-cache', unique));
      }
    } catch (error) {
      console.warn('Supabase indicator cache unavailable; falling back to runtime/provider data:', error.message);
    }
  }

  const cached = getCachedIndicators(symbols).filter(
    (item) => Number.isFinite(Number(item?.lastPrice)) && Number(item.lastPrice) > 0
  );
  if (cached.length > 0) {
    return res.json(indicatorResponse('runtime-cache', cached));
  }

  try {
    const refreshed = await refreshIndicators(symbols.length > 0 ? symbols : DEFAULT_SYMBOLS);
    const valid = (refreshed.data || []).filter(
      (item) => Number.isFinite(Number(item?.lastPrice)) && Number(item.lastPrice) > 0
    );
    if (valid.length === 0) {
      return res.status(503).json({
        error: 'Live indicator providers unavailable',
        source: 'provider-refresh',
        failures: refreshed.failures || [],
        ...freshness([]),
        data: [],
      });
    }
    return res.json(indicatorResponse('provider-refresh', valid, {
      failures: refreshed.failures || [],
      degraded: Boolean(refreshed.failures?.length),
    }));
  } catch (error) {
    console.error('Live indicators failed:', error.message);
    return res.status(503).json({
      error: 'Live indicator providers unavailable',
      message: error.message,
      ...freshness([]),
      data: [],
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : DEFAULT_SYMBOLS;
    const [news, indicators, macro] = await Promise.allSettled([
      refreshNews(),
      refreshIndicators(symbols),
      refreshMacroAndPersist(),
    ]);

    res.json({
      ok: true,
      news: news.status === 'fulfilled' ? news.value : { ok: false, error: news.reason?.message },
      indicators: indicators.status === 'fulfilled' ? indicators.value : { ok: false, error: indicators.reason?.message },
      macro: macro.status === 'fulfilled' ? macro.value : { ok: false, error: macro.reason?.message },
    });
  } catch (error) {
    console.error('Manual refresh failed:', error.message);
    res.status(500).json({ error: 'Failed to refresh live data' });
  }
});

router.post('/refresh/news', async (req, res) => {
  try {
    res.json(await refreshNews());
  } catch (error) {
    console.error('Manual news refresh failed:', error.message);
    res.status(500).json({ error: 'Failed to refresh news' });
  }
});

router.post('/refresh/indicators', async (req, res) => {
  try {
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : DEFAULT_SYMBOLS;
    const result = await refreshIndicators(symbols);
    if (!result.data?.length) return res.status(503).json({ ...result, ok: false });
    res.json({ ...result, degraded: Boolean(result.failures?.length) });
  } catch (error) {
    console.error('Manual indicators refresh failed:', error.message);
    res.status(500).json({ error: 'Failed to refresh indicators' });
  }
});

router.post('/refresh/macro', async (req, res) => {
  try {
    res.json(await refreshMacroAndPersist());
  } catch (error) {
    console.error('Manual macro refresh failed:', error.message);
    res.status(500).json({ error: 'Failed to refresh macro' });
  }
});

module.exports = router;
