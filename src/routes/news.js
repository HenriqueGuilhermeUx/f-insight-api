const express = require('express');
const axios = require('axios');
const router = express.Router();
const {
  getCachedNews,
  normalizeFinnhubNews,
  refreshNews,
} = require('../services/liveDataService');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Notícias gerais de mercado no formato esperado pelo frontend.
router.get('/', async (req, res) => {
  try {
    const { category = 'all', refresh = 'false' } = req.query;

    if (refresh === 'true') {
      await refreshNews();
    }

    const cached = await getCachedNews(20, category);
    if (cached.length > 0) {
      return res.json(cached);
    }

    const refreshed = await refreshNews();
    return res.json(refreshed.data.slice(0, 20));
  } catch (error) {
    console.error('Error fetching news:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Notícias de uma ação específica.
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const today = new Date();
    const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const response = await axios.get(`${FINNHUB_BASE}/company-news`, {
      params: { symbol, from, to, token: apiKey },
      timeout: 12000,
    });

    const news = Array.isArray(response.data)
      ? response.data.slice(0, 10).map((item) => normalizeFinnhubNews(item, symbol.toLowerCase()))
      : [];

    res.json(news);
  } catch (error) {
    console.error('Error fetching stock news:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Análise de sentimento simples com base em notícias recentes.
router.get('/sentiment/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const news = await getCachedNews(30, 'all');
    const related = news.filter((item) => {
      const text = `${item.title} ${item.summary} ${(item.tags || []).join(' ')}`.toLowerCase();
      return text.includes(symbol.toLowerCase().replace('.sa', ''));
    });

    const positiveCount = related.filter((item) => item.sentiment === 'positive').length;
    const negativeCount = related.filter((item) => item.sentiment === 'negative').length;
    const neutralCount = Math.max(related.length - positiveCount - negativeCount, 0);
    const score = positiveCount - negativeCount;
    const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';

    res.json({
      symbol,
      sentiment,
      score,
      positiveCount,
      negativeCount,
      neutralCount,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error analyzing sentiment:', error.message);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

module.exports = router;
