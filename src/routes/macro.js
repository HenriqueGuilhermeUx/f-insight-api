const express = require('express');
const router = express.Router();
const { getMacroData, refreshMacroData } = require('../services/macroService');

router.get('/overview', async (req, res) => {
  try {
    const force = req.query.refresh === 'true' || req.query.force === 'true';
    const data = await getMacroData({ force });
    res.json(data);
  } catch (error) {
    console.error('Error fetching macro overview:', error.message);
    res.status(500).json({ error: 'Failed to fetch macro overview' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const data = await refreshMacroData();
    res.json(data);
  } catch (error) {
    console.error('Error refreshing macro overview:', error.message);
    res.status(500).json({ error: 'Failed to refresh macro overview' });
  }
});

module.exports = router;
