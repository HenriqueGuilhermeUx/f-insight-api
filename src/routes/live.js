const express = require('express');
const router = express.Router();
const {
  DEFAULT_SYMBOLS,
  getLiveStatus,
  refreshIndicators,
  refreshMacroAndPersist,
  refreshNews,
} = require('../services/liveDataService');

router.get('/status', async (req, res) => {
  try {
    res.json(await getLiveStatus());
  } catch (error) {
    console.error('Live status failed:', error.message);
    res.status(500).json({ error: 'Failed to get live status' });
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
