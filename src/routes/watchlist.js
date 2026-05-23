const express = require('express');
const router = express.Router();

// Simulação em memória (em produção, usar Supabase)
let watchlists = new Map();

// Obter watchlist de usuário
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const watchlist = watchlists.get(userId) || [];

    res.json(watchlist);
  } catch (error) {
    console.error('Error fetching watchlist:', error.message);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// Adicionar à watchlist
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { ticker, name, type } = req.body;

    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' });
    }

    const watchlist = watchlists.get(userId) || [];

    if (watchlist.find(item => item.ticker === ticker)) {
      return res.status(400).json({ error: 'Asset already in watchlist' });
    }

    watchlist.push({
      ticker,
      name: name || ticker,
      type: type || 'stock',
      addedAt: new Date().toISOString()
    });

    watchlists.set(userId, watchlist);

    res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error adding to watchlist:', error.message);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// Remover da watchlist
router.delete('/:userId/:ticker', async (req, res) => {
  try {
    const { userId, ticker } = req.params;
    let watchlist = watchlists.get(userId) || [];

    watchlist = watchlist.filter(item => item.ticker !== ticker);
    watchlists.set(userId, watchlist);

    res.json({ success: true, watchlist });
  } catch (error) {
    console.error('Error removing from watchlist:', error.message);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

module.exports = router;