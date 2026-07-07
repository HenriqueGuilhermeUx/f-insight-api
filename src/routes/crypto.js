const express = require('express');
const axios = require('axios');
const router = express.Router();

const COINGECKO_PLAN = (process.env.COINGECKO_API_PLAN || 'demo').toLowerCase();
const COINGECKO_BASE = process.env.COINGECKO_API_BASE_URL
  || (COINGECKO_PLAN === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3');

function coinGeckoHeaders() {
  const apiKey = process.env.COINGECKO_API_KEY;
  if (!apiKey) return {};

  return COINGECKO_PLAN === 'pro'
    ? { 'x-cg-pro-api-key': apiKey }
    : { 'x-cg-demo-api-key': apiKey };
}

function coinGeckoConfig(params = {}) {
  return {
    params,
    headers: coinGeckoHeaders(),
    timeout: 12000,
  };
}

function cryptoError(res, error, message) {
  const status = error.response?.status || 500;
  const providerMessage = error.response?.data?.error || error.response?.data?.status?.error_message || error.message;
  console.error(message, providerMessage);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: message,
    provider: 'coingecko',
    providerStatus: error.response?.status || null,
    providerMessage,
    plan: COINGECKO_PLAN,
  });
}

// Lista de criptomoedas populares
router.get('/list', async (req, res) => {
  try {
    const response = await axios.get(`${COINGECKO_BASE}/coins/markets`, coinGeckoConfig({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 50,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h,7d,30d'
    }));

    const cryptos = response.data.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      change7d: coin.price_change_percentage_7d_in_currency,
      change30d: coin.price_change_percentage_30d_in_currency,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      image: coin.image,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      rank: coin.market_cap_rank,
      source: 'coingecko',
      plan: COINGECKO_PLAN,
      updatedAt: new Date().toISOString()
    }));

    res.json(cryptos);

  } catch (error) {
    cryptoError(res, error, 'Failed to fetch crypto data');
  }
});

// Dados de uma criptomoeda específica
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${COINGECKO_BASE}/coins/${id}`, coinGeckoConfig({
      localization: false,
      tickers: false,
      market_data: true,
      community_data: false,
      developer_data: false
    }));

    const data = response.data;

    res.json({
      id: data.id,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      description: data.description.en,
      currentPrice: data.market_data.current_price.usd,
      marketCap: data.market_data.market_cap.usd,
      volume24h: data.market_data.total_volume.usd,
      priceChange24h: data.market_data.price_change_percentage_24h,
      priceChange7d: data.market_data.price_change_percentage_7d,
      priceChange30d: data.market_data.price_change_percentage_30d,
      high24h: data.market_data.high_24h.usd,
      low24h: data.market_data.low_24h.usd,
      circulatingSupply: data.market_data.circulating_supply,
      totalSupply: data.market_data.total_supply,
      maxSupply: data.market_data.max_supply,
      image: data.image?.large,
      rank: data.market_cap_rank,
      source: 'coingecko',
      plan: COINGECKO_PLAN,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    cryptoError(res, error, 'Failed to fetch crypto data');
  }
});

// Histórico de preço
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const response = await axios.get(`${COINGECKO_BASE}/coins/${id}/market_chart`, coinGeckoConfig({
      vs_currency: 'usd',
      days: parseInt(days)
    }));

    res.json({
      prices: response.data.prices,
      market_caps: response.data.market_caps,
      volumes: response.data.total_volumes,
      source: 'coingecko',
      plan: COINGECKO_PLAN,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    cryptoError(res, error, 'Failed to fetch history');
  }
});

module.exports = router;
