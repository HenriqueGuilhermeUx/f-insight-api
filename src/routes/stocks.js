const express = require('express');
const axios = require('axios');
const router = express.Router();

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const REQUEST_TIMEOUT_MS = 12000;

function validQuote(data) {
  return data && Number.isFinite(Number(data.c)) && Number(data.c) > 0 && Number.isFinite(Number(data.t)) && Number(data.t) > 0;
}

function quotePayload(symbol, data, extra = {}) {
  if (!validQuote(data)) return null;
  return {
    symbol: symbol.toUpperCase(),
    price: Number(data.c),
    change: Number.isFinite(Number(data.d)) ? Number(data.d) : 0,
    changePercent: Number.isFinite(Number(data.dp)) ? Number(data.dp) : 0,
    high: Number.isFinite(Number(data.h)) ? Number(data.h) : null,
    low: Number.isFinite(Number(data.l)) ? Number(data.l) : null,
    open: Number.isFinite(Number(data.o)) ? Number(data.o) : null,
    previousClose: Number.isFinite(Number(data.pc)) ? Number(data.pc) : null,
    provider: 'finnhub',
    providerTimestamp: new Date(Number(data.t) * 1000).toISOString(),
    responseAt: new Date().toISOString(),
    ...extra,
  };
}

async function finnhubGet(path, params) {
  return axios.get(`${FINNHUB_BASE}${path}`, {
    params,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

router.get('/brazil', async (req, res) => {
  try {
    const { symbol = 'PETR4' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Market data provider not configured' });

    const b3Symbols = {
      PETR4: 'PETR4.SAO', VALE3: 'VALE3.SAO', ITUB4: 'ITUB4.SAO', BBDC4: 'BBDC4.SAO',
      ABEV3: 'ABEV3.SAO', BBAS3: 'BBAS3.SAO', PETR3: 'PETR3.SAO', MGLU3: 'MGLU3.SAO',
      WEGE3: 'WEGE3.SAO', RENT3: 'RENT3.SAO', EGIE3: 'EGIE3.SAO', SBSP3: 'SBSP3.SAO',
      CPLE6: 'CPLE6.SAO', TAEE4: 'TAEE4.SAO', ENBR3: 'ENBR3.SAO',
    };
    const clean = String(symbol).trim().toUpperCase();
    const providerSymbol = b3Symbols[clean] || `${clean}.SAO`;
    const response = await finnhubGet('/quote', { symbol: providerSymbol, token: apiKey });
    const payload = quotePayload(clean, response.data, { name: clean, providerSymbol });
    if (!payload) return res.status(503).json({ error: 'Market quote unavailable', symbol: clean, provider: 'finnhub' });
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching Brazilian stock:', error.message);
    return res.status(503).json({ error: 'Market quote unavailable' });
  }
});

router.get('/us', async (req, res) => {
  try {
    const { symbol = 'AAPL' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Market data provider not configured' });
    const clean = String(symbol).trim().toUpperCase();
    const response = await finnhubGet('/quote', { symbol: clean, token: apiKey });
    const payload = quotePayload(clean, response.data);
    if (!payload) return res.status(503).json({ error: 'Market quote unavailable', symbol: clean, provider: 'finnhub' });
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching US stock:', error.message);
    return res.status(503).json({ error: 'Market quote unavailable' });
  }
});

router.get('/indices', async (req, res) => {
  try {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Market data provider not configured' });

    const indices = [
      { symbol: '^BVSP', name: 'Ibovespa', country: 'BR' },
      { symbol: '^GSPC', name: 'S&P 500', country: 'US' },
      { symbol: '^IXIC', name: 'NASDAQ', country: 'US' },
      { symbol: '^DJI', name: 'Dow Jones', country: 'US' },
      { symbol: '^FTSE', name: 'FTSE 100', country: 'UK' },
      { symbol: '^N225', name: 'Nikkei 225', country: 'JP' },
    ];

    const results = await Promise.all(indices.map(async (idx) => {
      try {
        const response = await finnhubGet('/quote', { symbol: idx.symbol, token: apiKey });
        const quote = quotePayload(idx.symbol, response.data, { name: idx.name, country: idx.country });
        return quote ? {
          ticker: idx.symbol,
          name: idx.name,
          country: idx.country,
          value: quote.price,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          provider: quote.provider,
          providerTimestamp: quote.providerTimestamp,
          available: true,
        } : {
          ticker: idx.symbol,
          name: idx.name,
          country: idx.country,
          available: false,
          provider: 'finnhub',
        };
      } catch {
        return { ticker: idx.symbol, name: idx.name, country: idx.country, available: false, provider: 'finnhub' };
      }
    }));

    return res.json(results);
  } catch (error) {
    console.error('Error fetching indices:', error.message);
    return res.status(503).json({ error: 'Market indices unavailable' });
  }
});

router.get('/candles/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { resolution = 'D', from, to } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Market data provider not configured' });

    const now = Math.floor(Date.now() / 1000);
    const fromTime = from || now - 30 * 24 * 60 * 60;
    const toTime = to || now;
    const response = await finnhubGet('/stock/candle', {
      symbol,
      resolution,
      from: fromTime,
      to: toTime,
      token: apiKey,
    });

    if (response.data?.s !== 'ok' || !Array.isArray(response.data?.c) || response.data.c.length === 0) {
      return res.status(404).json({ error: 'No market candle data found', symbol, provider: 'finnhub' });
    }

    return res.json({
      c: response.data.c,
      h: response.data.h,
      l: response.data.l,
      o: response.data.o,
      v: response.data.v,
      t: response.data.t,
      provider: 'finnhub',
      responseAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching candles:', error.message);
    return res.status(503).json({ error: 'Market candle data unavailable' });
  }
});

router.get('/fundamentals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Market data provider not configured' });

    const [profile, metrics] = await Promise.all([
      finnhubGet('/stock/profile2', { symbol, token: apiKey }),
      finnhubGet('/stock/metric', { symbol, token: apiKey, metric: 'all' }),
    ]);

    if (!profile.data || !metrics.data?.metric) {
      return res.status(404).json({ error: 'Fundamental data unavailable', symbol, provider: 'finnhub' });
    }

    return res.json({
      profile: profile.data,
      metrics: metrics.data.metric,
      provider: 'finnhub',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching fundamentals:', error.message);
    return res.status(503).json({ error: 'Fundamental data unavailable' });
  }
});

module.exports = router;
