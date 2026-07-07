const express = require('express');
const router = express.Router();
const {
  DEFAULT_SYMBOLS,
  getLiveStatus,
  refreshIndicators,
  refreshMacroAndPersist,
  refreshNews,
} = require('../services/liveDataService');
const { supabase, isSupabaseEnabled } = require('../services/supabaseClient');

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

router.get('/status', async (req, res) => {
  try {
    res.json(await getLiveStatus());
  } catch (error) {
    console.error('Live status failed:', error.message);
    res.status(500).json({ error: 'Failed to get live status' });
  }
});

router.get('/indicators', async (req, res) => {
  try {
    if (!isSupabaseEnabled()) {
      return res.status(503).json({ error: 'Supabase backend not configured' });
    }

    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    let query = supabase
      .from('market_indicator_snapshots')
      .select('symbol,provider,last_price,change,change_percent,avg_volume,candles,fetched_at')
      .order('fetched_at', { ascending: false });

    if (symbols.length > 0) {
      query = query.in('symbol', symbols);
    }

    const { data, error } = await query;
    if (error) throw error;

    const unique = Array.from(
      new Map((data || []).map((row) => [row.symbol, mapIndicatorRow(row)])).values()
    );

    res.json({
      source: 'supabase-cache',
      count: unique.length,
      updatedAt: new Date().toISOString(),
      data: unique,
    });
  } catch (error) {
    console.error('Live indicators failed:', error.message);
    res.status(500).json({ error: 'Failed to get live indicators', message: error.message });
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
    res.json(await refreshIndicators(symbols));
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
