const express = require('express');
const router = express.Router();
const store = require('../services/userMarketPreferencesStore');
const { requireAuthenticatedUser } = require('../services/authMiddleware');

router.get('/_health/storage', (_req, res) => {
  res.json({
    ok: true,
    service: 'user-market-preferences',
    storageMode: store.storageMode(),
    watchlistTable: store.WATCHLIST_TABLE,
    alertsTable: store.ALERTS_TABLE,
    access: 'authenticated-owner-only',
  });
});

router.use(requireAuthenticatedUser);

router.get('/me', async (req, res) => {
  try {
    const watchlist = await store.getWatchlist(req.authUser.id);
    return res.json(watchlist);
  } catch (error) {
    console.error('Error fetching watchlist:', error.message);
    return res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

router.post('/me', async (req, res) => {
  try {
    const watchlist = await store.addWatchlistItem(req.authUser.id, req.body || {});
    return res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error adding to watchlist:', error.message);
    if (['TICKER_REQUIRED', 'WATCHLIST_DUPLICATE'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

router.delete('/me/:ticker', async (req, res) => {
  try {
    const watchlist = await store.removeWatchlistItem(req.authUser.id, req.params.ticker);
    return res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error removing from watchlist:', error.message);
    if (error.code === 'TICKER_REQUIRED') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

module.exports = router;
