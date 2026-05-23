const express = require('express');
const axios = require('axios');
const router = express.Router();

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Busca dados de ações brasileiras
router.get('/brazil', async (req, res) => {
  try {
    const { symbol = 'PETR4' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    // Mapeamento de símbolos B3
    const b3Symbols = {
      'PETR4': 'PETR4.SAO',
      'VALE3': 'VALE3.SAO',
      'ITUB4': 'ITUB4.SAO',
      'BBDC4': 'BBDC4.SAO',
      'ABEV3': 'ABEV3.SAO',
      'BBAS3': 'BBAS3.SAO',
      'PETR3': 'PETR3.SAO',
      'MGLU3': 'MGLU3.SAO',
      'WEGE3': 'WEGE3.SAO',
      'RENT3': 'RENT3.SAO',
      'EGIE3': 'EGIE3.SAO',
      'SBSP3': 'SBSP3.SAO',
      'CPLE6': 'CPLE6.SAO',
      'TAEE4': 'TAEE4.SAO',
      'ENBR3': 'ENBR3.SAO'
    };

    const finnhubSymbol = b3Symbols[symbol.toUpperCase()] || `${symbol}.SAO`;

    const response = await axios.get(
      `${FINNHUB_BASE}/quote?symbol=${finnhubSymbol}&token=${apiKey}`
    );

    const data = response.data;

    res.json({
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price: data.c || 0,
      change: data.d || 0,
      changePercent: data.dp || 0,
      high: data.h || 0,
      low: data.l || 0,
      open: data.o || 0,
      previousClose: data.pc || 0,
      timestamp: data.t || Date.now()
    });

  } catch (error) {
    console.error('Error fetching Brazilian stock:', error.message);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Busca dados de ações americanas
router.get('/us', async (req, res) => {
  try {
    const { symbol = 'AAPL' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const response = await axios.get(
      `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${apiKey}`
    );

    const data = response.data;

    res.json({
      symbol: symbol.toUpperCase(),
      price: data.c || 0,
      change: data.d || 0,
      changePercent: data.dp || 0,
      high: data.h || 0,
      low: data.l || 0,
      open: data.o || 0,
      previousClose: data.pc || 0,
      timestamp: data.t || Date.now()
    });

  } catch (error) {
    console.error('Error fetching US stock:', error.message);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Lista de principais índices
router.get('/indices', async (req, res) => {
  try {
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const indices = [
      { symbol: '^BVSP', name: 'Ibovespa', country: 'BR' },
      { symbol: '^GSPC', name: 'S&P 500', country: 'US' },
      { symbol: '^IXIC', name: 'NASDAQ', country: 'US' },
      { symbol: '^DJI', name: 'Dow Jones', country: 'US' },
      { symbol: '^FTSE', name: 'FTSE 100', country: 'UK' },
      { symbol: '^N225', name: 'Nikkei 225', country: 'JP' }
    ];

    const results = await Promise.all(
      indices.map(async (idx) => {
        try {
          const response = await axios.get(
            `${FINNHUB_BASE}/quote?symbol=${idx.symbol}&token=${apiKey}`
          );
          return {
            ...idx,
            price: response.data.c || 0,
            change: response.data.d || 0,
            changePercent: response.data.dp || 0
          };
        } catch (e) {
          return { ...idx, price: 0, change: 0, changePercent: 0, error: true };
        }
      })
    );

    res.json(results);

  } catch (error) {
    console.error('Error fetching indices:', error.message);
    res.status(500).json({ error: 'Failed to fetch indices' });
  }
});

// Busca candle chart
router.get('/candles/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { resolution = 'D', from, to } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const now = Math.floor(Date.now() / 1000);
    const fromTime = from || now - 30 * 24 * 60 * 60;
    const toTime = to || now;

    const response = await axios.get(
      `${FINNHUB_BASE}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${fromTime}&to=${toTime}&token=${apiKey}`
    );

    if (response.data.s === 'ok') {
      res.json({
        c: response.data.c,
        h: response.data.h,
        l: response.data.l,
        o: response.data.o,
        v: response.data.v,
        t: response.data.t
      });
    } else {
      res.status(404).json({ error: 'No data found' });
    }

  } catch (error) {
    console.error('Error fetching candles:', error.message);
    res.status(500).json({ error: 'Failed to fetch candles' });
  }
});

// Busca dados fundamentalistas
router.get('/fundamentals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const [profile, metrics] = await Promise.all([
      axios.get(`${FINNHUB_BASE}/stock/profile2?symbol=${symbol}&token=${apiKey}`),
      axios.get(`${FINNHUB_BASE}/stock/metric?symbol=${symbol}&token=${apiKey}&metric=all`)
    ]);

    res.json({
      profile: profile.data,
      metrics: metrics.data?.metric || {}
    });

  } catch (error) {
    console.error('Error fetching fundamentals:', error.message);
    res.status(500).json({ error: 'Failed to fetch fundamentals' });
  }
});

module.exports = router;