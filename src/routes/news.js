const express = require('express');
const axios = require('axios');
const router = express.Router();

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Notícias gerais de mercado
router.get('/', async (req, res) => {
  try {
    const { category = 'general' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const categoryMap = {
      'general': 'general',
      'forex': 'forex',
      'crypto': 'crypto',
      'merger': 'merger',
      'tech': 'technology'
    };

    const response = await axios.get(
      `${FINNHUB_BASE}/news?category=${categoryMap[category] || 'general'}&token=${apiKey}`
    );

    const news = response.data.slice(0, 20).map(item => ({
      id: item.id,
      category: item.category,
      datetime: item.datetime,
      headline: item.headline,
      image: item.image,
      source: item.source,
      summary: item.summary,
      url: item.url
    }));

    res.json(news);

  } catch (error) {
    console.error('Error fetching news:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Notícias de uma ação específica
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const response = await axios.get(
      `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=&to=&token=${apiKey}`
    );

    const news = response.data.slice(0, 10).map(item => ({
      id: item.id,
      datetime: item.datetime,
      headline: item.headline,
      image: item.image,
      source: item.source,
      summary: item.summary,
      url: item.url
    }));

    res.json(news);

  } catch (error) {
    console.error('Error fetching stock news:', error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Análise de sentimento (simulada)
router.get('/sentiment/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    res.json({
      symbol,
      sentiment: 'neutral',
      score: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error analyzing sentiment:', error.message);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

module.exports = router;