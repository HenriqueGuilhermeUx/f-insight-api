const express = require('express');
const router = express.Router();
const { getActiveSignals } = require('../services/macroService');

router.get('/active', (req, res) => {
  try {
    res.json(getActiveSignals());
  } catch (error) {
    console.error('Error fetching allocation signals:', error.message);
    res.status(500).json({ error: 'Failed to fetch allocation signals' });
  }
});

router.get('/by-ticker/:ticker', (req, res) => {
  try {
    const ticker = String(req.params.ticker || '').toUpperCase();
    const results = getActiveSignals().filter((item) =>
      Array.isArray(item.tickers) && item.tickers.includes(ticker)
    );
    res.json(results);
  } catch (error) {
    console.error('Error fetching allocation signals by ticker:', error.message);
    res.status(500).json({ error: 'Failed to fetch allocation signals by ticker' });
  }
});

module.exports = router;
