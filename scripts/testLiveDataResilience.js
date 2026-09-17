'use strict';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;
process.env.FINNHUB_API_KEY = 'ci-test-key';

const assert = require('assert');
const axios = require('axios');

const now = Math.floor(Date.now() / 1000);
const candles = {
  s: 'ok',
  c: [10, 10.5, 11],
  h: [10.2, 10.7, 11.2],
  l: [9.8, 10.2, 10.8],
  o: [9.9, 10.4, 10.9],
  v: [1000, 1200, 1400],
  t: [now - 172800, now - 86400, now],
};

axios.get = async (url, config = {}) => {
  if (String(url).includes('/stock/candle')) {
    return { data: candles };
  }

  if (String(url).includes('/news')) {
    return {
      data: [
        {
          id: 1,
          headline: 'Mercado avança em sessão de teste',
          summary: 'Notícia simulada para validar fallback em memória.',
          source: 'CI',
          url: 'https://example.com/test',
          datetime: now,
          category: config.params?.category || 'general',
        },
      ],
    };
  }

  throw new Error('Unexpected axios URL in test: ' + url);
};

const service = require('../src/services/liveDataService');

async function main() {
  const indicators = await service.refreshIndicators(['PETR4.SA']);
  assert.equal(indicators.ok, true);
  assert.equal(indicators.count, 1);
  assert.equal(indicators.persisted, false);
  assert.equal(indicators.data[0].provider, 'finnhub');

  const cachedIndicators = service.getCachedIndicators(['PETR4.SA']);
  assert.equal(cachedIndicators.length, 1);
  assert.equal(cachedIndicators[0].symbol, 'PETR4.SA');
  assert.equal(cachedIndicators[0].lastPrice, 11);

  const news = await service.refreshNews(['general']);
  assert.equal(news.ok, true);
  assert.equal(news.count, 1);
  assert.equal(news.persisted, false);

  const cachedNews = await service.getCachedNews(10, 'general');
  assert.equal(cachedNews.length, 1);
  assert.equal(cachedNews[0].source, 'CI');

  console.log('live-data-resilience: ok');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
