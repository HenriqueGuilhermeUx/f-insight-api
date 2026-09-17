const express = require('express');
const router = express.Router();
const store = require('../services/userMarketPreferencesStore');

router.get('/:userId', async (req, res) => {
  try {
    const watchlist = await store.getWatchlist(req.params.userId);
    res.json(watchlist);
  } catch (error) {
    console.error('Error fetching watchlist:', error.message);
    const status = error.code === 'USER_ID_REQUIRED' ? 400 : 500;
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to fetch watchlist' });
  }
});

router.post('/:userId', async (req, res) => {
  try {
    const watchlist = await store.addWatchlistItem(req.params.userId, req.body || {});
    res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error adding to watchlist:', error.message);
    if (['USER_ID_REQUIRED', 'TICKER_REQUIRED', 'WATCHLIST_DUPLICATE'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

router.delete('/:userId/:ticker', async (req, res) => {
  try {
    const watchlist = await store.removeWatchlistItem(req.params.userId, req.params.ticker);
    res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error removing from watchlist:', error.message);
    if (['USER_ID_REQUIRED', 'TICKER_REQUIRED'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

module.exports = router;
