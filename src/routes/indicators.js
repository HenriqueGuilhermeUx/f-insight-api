const express = require('express');
const axios = require('axios');
const router = express.Router();

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Indicadores técnicos para uma ação
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { resolution = 'D' } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Finnhub API key not configured' });
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - 365 * 24 * 60 * 60;

    const candleResponse = await axios.get(
      `${FINNHUB_BASE}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${apiKey}`
    );

    if (candleResponse.data.s !== 'ok') {
      return res.status(404).json({ error: 'No data found' });
    }

    const { c, h, l, o, v, t } = candleResponse.data;
    const indicators = calculateIndicators(c, h, l, o, v, t);

    res.json({
      symbol,
      ...indicators,
      candles: {
        close: c.slice(-100),
        high: h.slice(-100),
        low: l.slice(-100),
        open: o.slice(-100),
        volume: v.slice(-100),
        timestamp: t.slice(-100)
      }
    });

  } catch (error) {
    console.error('Error calculating indicators:', error.message);
    res.status(500).json({ error: 'Failed to calculate indicators' });
  }
});

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (!ema12 || !ema26) return { line: 0, signal: 0, histogram: 0 };

  const macdLine = ema12 - ema26;
  const signal = macdLine * 0.9;

  return {
    line: macdLine,
    signal: signal,
    histogram: macdLine - signal
  };
}

function calculateBollinger(prices, period = 20) {
  const sma = calculateSMA(prices, period);
  if (!sma) return { upper: 0, middle: 0, lower: 0 };

  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: sma + (stdDev * 2),
    middle: sma,
    lower: sma - (stdDev * 2)
  };
}

function calculateSupportResistance(high, low, close) {
  const recentHigh = Math.max(...high.slice(-50));
  const recentLow = Math.min(...low.slice(-50));

  return {
    support: recentLow * 0.95,
    resistance: recentHigh * 1.05
  };
}

function calculateIndicators(close, high, low, open, volume, timestamps) {
  const rsi = calculateRSI(close, 14);
  const sma50 = calculateSMA(close, 50);
  const sma200 = calculateSMA(close, 200);
  const ema12 = calculateEMA(close, 12);
  const ema26 = calculateEMA(close, 26);
  const macd = calculateMACD(close);
  const bollinger = calculateBollinger(close, 20);
  const supportResistance = calculateSupportResistance(high, low, close);
  const avgVolume = volume.slice(-20).reduce((a, b) => a + b, 0) / 20;

  return {
    rsi,
    sma50,
    sma200,
    ema12,
    ema26,
    macd,
    bollinger,
    support: supportResistance.support,
    resistance: supportResistance.resistance,
    avgVolume
  };
}

module.exports = router;