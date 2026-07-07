const axios = require('axios');
const { supabase, isSupabaseEnabled } = require('./supabaseClient');
const { refreshMacroData, getMacroData } = require('./macroService');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const DEFAULT_NEWS_CATEGORIES = ['general', 'forex', 'crypto', 'technology'];
const DEFAULT_SYMBOLS = ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'WEGE3.SA'];

let runtimeCache = {
  news: [],
  indicators: {},
  status: {
    lastNewsRefreshAt: null,
    lastIndicatorsRefreshAt: null,
    lastMacroRefreshAt: null,
    source: 'memory',
  },
};

function stableId(...parts) {
  return parts
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180);
}

function classifySentiment(title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase();
  const positive = ['alta', 'sobe', 'cresce', 'ganha', 'recorde', 'lucro', 'avanço', 'optimism', 'rally', 'surge'];
  const negative = ['queda', 'cai', 'perde', 'risco', 'prejuízo', 'crise', 'recuo', 'selloff', 'slump', 'down'];
  if (positive.some((word) => text.includes(word))) return 'positive';
  if (negative.some((word) => text.includes(word))) return 'negative';
  return 'neutral';
}

function normalizeFinnhubNews(item, category = 'general') {
  const publishedAt = item.datetime
    ? new Date(item.datetime * 1000).toISOString()
    : new Date().toISOString();
  const title = item.headline || item.title || 'Notícia de mercado';
  const summary = item.summary || item.description || 'Resumo indisponível no provedor.';
  const source = item.source || 'Finnhub';
  const url = item.url || '#';
  const tags = [category, item.category, source].filter(Boolean).map((tag) => String(tag).toLowerCase());

  return {
    id: String(item.id || stableId(source, title, publishedAt)),
    title,
    summary,
    source,
    url,
    image: item.image || null,
    publishedAt,
    tags: [...new Set(tags)],
    sentiment: classifySentiment(title, summary),
    raw: item,
  };
}

async function recordRefreshRun(kind, status, metadata = {}) {
  if (!isSupabaseEnabled()) return;
  await supabase.from('market_refresh_runs').insert({
    kind,
    status,
    metadata,
    ran_at: new Date().toISOString(),
  });
}

async function getCachedNews(limit = 20, category = 'all') {
  if (isSupabaseEnabled()) {
    let query = supabase
      .from('market_news')
      .select('provider_id,title,summary,source,url,image_url,published_at,tags,sentiment,category')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((item) => ({
        id: item.provider_id,
        title: item.title,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image: item.image_url,
        publishedAt: item.published_at,
        tags: item.tags || [item.category].filter(Boolean),
        sentiment: item.sentiment || 'neutral',
      }));
    }
  }

  return runtimeCache.news.slice(0, limit);
}

async function fetchFinnhubCategory(category) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error('FINNHUB_API_KEY not configured');

  const providerCategory = category === 'technology' ? 'technology' : category;
  const response = await axios.get(`${FINNHUB_BASE}/news`, {
    params: { category: providerCategory, token: apiKey },
    timeout: 12000,
  });

  return Array.isArray(response.data)
    ? response.data.slice(0, 20).map((item) => normalizeFinnhubNews(item, category))
    : [];
}

async function refreshNews(categories = DEFAULT_NEWS_CATEGORIES) {
  const startedAt = Date.now();
  try {
    const batches = await Promise.allSettled(categories.map((category) => fetchFinnhubCategory(category)));
    const news = batches
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const unique = Array.from(new Map(news.map((item) => [item.id, item])).values()).slice(0, 80);
    runtimeCache.news = unique;
    runtimeCache.status.lastNewsRefreshAt = new Date().toISOString();

    if (isSupabaseEnabled() && unique.length > 0) {
      const rows = unique.map((item) => ({
        provider: 'finnhub',
        provider_id: item.id,
        category: item.tags[0] || 'general',
        title: item.title,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image_url: item.image,
        published_at: item.publishedAt,
        tags: item.tags,
        sentiment: item.sentiment,
        raw: item.raw || item,
      }));

      const { error } = await supabase
        .from('market_news')
        .upsert(rows, { onConflict: 'provider,provider_id' });

      if (error) throw error;
    }

    await recordRefreshRun('news', 'success', {
      count: unique.length,
      durationMs: Date.now() - startedAt,
      categories,
    });

    return { ok: true, count: unique.length, data: unique };
  } catch (error) {
    await recordRefreshRun('news', 'error', { message: error.message });
    throw error;
  }
}

function calculateIndicators(close, high, low, open, volume, timestamps) {
  const slice = (arr, n) => Array.isArray(arr) ? arr.slice(-n) : [];
  const last = slice(close, 1)[0] || 0;
  const previous = slice(close, 2)[0] || last;
  const change = last - previous;
  const changePercent = previous ? (change / previous) * 100 : 0;
  const avgVolume = slice(volume, 20).reduce((a, b) => a + b, 0) / Math.max(slice(volume, 20).length, 1);

  return {
    lastPrice: last,
    change,
    changePercent,
    avgVolume,
    candles: {
      close: slice(close, 100),
      high: slice(high, 100),
      low: slice(low, 100),
      open: slice(open, 100),
      volume: slice(volume, 100),
      timestamp: slice(timestamps, 100),
    },
  };
}

async function fetchSymbolIndicators(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error('FINNHUB_API_KEY not configured');

  const now = Math.floor(Date.now() / 1000);
  const from = now - 365 * 24 * 60 * 60;
  const response = await axios.get(`${FINNHUB_BASE}/stock/candle`, {
    params: { symbol, resolution: 'D', from, to: now, token: apiKey },
    timeout: 12000,
  });

  if (response.data?.s !== 'ok') throw new Error(`No candle data for ${symbol}`);
  const { c, h, l, o, v, t } = response.data;
  const indicators = calculateIndicators(c, h, l, o, v, t);

  return {
    symbol,
    provider: 'finnhub',
    fetchedAt: new Date().toISOString(),
    ...indicators,
  };
}

async function refreshIndicators(symbols = DEFAULT_SYMBOLS) {
  const startedAt = Date.now();
  try {
    const batches = await Promise.allSettled(symbols.map((symbol) => fetchSymbolIndicators(symbol)));
    const snapshots = batches
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    snapshots.forEach((snapshot) => {
      runtimeCache.indicators[snapshot.symbol] = snapshot;
    });
    runtimeCache.status.lastIndicatorsRefreshAt = new Date().toISOString();

    if (isSupabaseEnabled() && snapshots.length > 0) {
      const rows = snapshots.map((item) => ({
        symbol: item.symbol,
        provider: item.provider,
        last_price: item.lastPrice,
        change: item.change,
        change_percent: item.changePercent,
        avg_volume: item.avgVolume,
        candles: item.candles,
        fetched_at: item.fetchedAt,
      }));
      const { error } = await supabase
        .from('market_indicator_snapshots')
        .upsert(rows, { onConflict: 'symbol,provider' });

      if (error) throw error;
    }

    await recordRefreshRun('indicators', 'success', {
      count: snapshots.length,
      durationMs: Date.now() - startedAt,
      symbols,
    });

    return { ok: true, count: snapshots.length, data: snapshots };
  } catch (error) {
    await recordRefreshRun('indicators', 'error', { message: error.message });
    throw error;
  }
}

async function refreshMacroAndPersist() {
  const startedAt = Date.now();
  try {
    const macro = await refreshMacroData();
    runtimeCache.status.lastMacroRefreshAt = new Date().toISOString();

    if (isSupabaseEnabled()) {
      await supabase.from('market_macro_snapshots').insert({
        source: macro.source,
        payload: macro,
        fetched_at: macro.updatedAt || new Date().toISOString(),
      });
    }

    await recordRefreshRun('macro', 'success', {
      durationMs: Date.now() - startedAt,
      source: macro.source,
    });

    return { ok: true, data: macro };
  } catch (error) {
    await recordRefreshRun('macro', 'error', { message: error.message });
    throw error;
  }
}

async function getLiveStatus() {
  let dbStatus = null;
  if (isSupabaseEnabled()) {
    const { data } = await supabase
      .from('market_refresh_runs')
      .select('kind,status,ran_at,metadata')
      .order('ran_at', { ascending: false })
      .limit(10);
    dbStatus = data || [];
  }

  return {
    supabase: isSupabaseEnabled(),
    cache: runtimeCache.status,
    lastRuns: dbStatus,
    macro: getMacroData(),
  };
}

module.exports = {
  DEFAULT_NEWS_CATEGORIES,
  DEFAULT_SYMBOLS,
  getCachedNews,
  refreshNews,
  refreshIndicators,
  refreshMacroAndPersist,
  getLiveStatus,
  normalizeFinnhubNews,
};
