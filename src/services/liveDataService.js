const axios = require('axios');
const { supabase, isSupabaseEnabled } = require('./supabaseClient');
const { refreshMacroData, getMacroData } = require('./macroService');

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
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
  db: {
    news: null,
    indicators: null,
    macro: null,
    refreshRuns: null,
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

function updateDbStatus(key, ok, detail = {}) {
  runtimeCache.db[key] = {
    ok,
    checkedAt: new Date().toISOString(),
    ...detail,
  };
}

async function recordRefreshRun(kind, status, metadata = {}) {
  if (!isSupabaseEnabled()) return { ok: false, skipped: true, reason: 'supabase-disabled' };

  const { error } = await supabase.from('market_refresh_runs').insert({
    kind,
    status,
    metadata,
    ran_at: new Date().toISOString(),
  });

  if (error) {
    updateDbStatus('refreshRuns', false, { error: error.message });
    console.warn('Failed to record refresh run:', error.message);
    return { ok: false, error: error.message };
  }

  updateDbStatus('refreshRuns', true);
  return { ok: true };
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
      updateDbStatus('news', true, { readCount: data.length });
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

    if (error) updateDbStatus('news', false, { error: error.message });
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

    let persisted = false;
    let persistError = null;

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

      if (error) {
        persistError = error.message;
        updateDbStatus('news', false, { error: error.message });
      } else {
        persisted = true;
        updateDbStatus('news', true, { writeCount: rows.length });
      }
    }

    await recordRefreshRun('news', persistError ? 'partial' : 'success', {
      count: unique.length,
      persisted,
      persistError,
      durationMs: Date.now() - startedAt,
      categories,
    });

    return { ok: true, count: unique.length, persisted, persistError, data: unique };
  } catch (error) {
    await recordRefreshRun('news', 'error', { message: error.message });
    throw error;
  }
}

function compactSeries(values = []) {
  return values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null));
}

function calculateIndicators(close, high, low, open, volume, timestamps) {
  const validClose = compactSeries(close).filter((value) => value !== null);
  const slice = (arr, n) => Array.isArray(arr) ? arr.slice(-n) : [];
  const last = slice(validClose, 1)[0] || 0;
  const previous = slice(validClose, 2)[0] || last;
  const change = last - previous;
  const changePercent = previous ? (change / previous) * 100 : 0;
  const validVolume = compactSeries(volume).filter((value) => value !== null);
  const avgVolume = slice(validVolume, 20).reduce((a, b) => a + b, 0) / Math.max(slice(validVolume, 20).length, 1);

  return {
    lastPrice: last,
    change,
    changePercent,
    avgVolume,
    candles: {
      close: slice(compactSeries(close), 100),
      high: slice(compactSeries(high), 100),
      low: slice(compactSeries(low), 100),
      open: slice(compactSeries(open), 100),
      volume: slice(compactSeries(volume), 100),
      timestamp: slice(timestamps || [], 100),
    },
  };
}

async function fetchFinnhubSymbolIndicators(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error('FINNHUB_API_KEY not configured');

  const now = Math.floor(Date.now() / 1000);
  const from = now - 365 * 24 * 60 * 60;
  const response = await axios.get(`${FINNHUB_BASE}/stock/candle`, {
    params: { symbol, resolution: 'D', from, to: now, token: apiKey },
    timeout: 12000,
  });

  if (response.data?.s !== 'ok') throw new Error(`No Finnhub candle data for ${symbol}: ${response.data?.s || 'unknown'}`);
  const { c, h, l, o, v, t } = response.data;
  const indicators = calculateIndicators(c, h, l, o, v, t);

  if (!indicators.lastPrice) throw new Error(`Empty Finnhub price for ${symbol}`);

  return {
    symbol,
    provider: 'finnhub',
    fetchedAt: new Date().toISOString(),
    ...indicators,
  };
}

function yahooSymbolVariants(symbol) {
  const clean = String(symbol || '').trim().toUpperCase();
  const withoutSuffix = clean.replace(/\.SA$/i, '');
  return [...new Set([clean, `${withoutSuffix}.SA`, withoutSuffix].filter(Boolean))];
}

async function fetchYahooSymbolIndicators(symbol) {
  const variants = yahooSymbolVariants(symbol);
  const errors = [];

  for (const variant of variants) {
    try {
      const response = await axios.get(`${YAHOO_CHART_BASE}/${encodeURIComponent(variant)}`, {
        params: { range: '1y', interval: '1d' },
        timeout: 12000,
      });

      const result = response.data?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const timestamps = result?.timestamp || [];

      if (!quote || !Array.isArray(quote.close)) throw new Error(`Empty Yahoo chart for ${variant}`);

      const indicators = calculateIndicators(quote.close, quote.high, quote.low, quote.open, quote.volume, timestamps);
      if (!indicators.lastPrice) throw new Error(`Empty Yahoo price for ${variant}`);

      return {
        symbol,
        provider: 'yahoo',
        providerSymbol: variant,
        fetchedAt: new Date().toISOString(),
        ...indicators,
      };
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | ') || `No Yahoo data for ${symbol}`);
}

async function fetchSymbolIndicators(symbol) {
  const errors = [];

  try {
    return await fetchFinnhubSymbolIndicators(symbol);
  } catch (error) {
    errors.push(`finnhub: ${error.message}`);
  }

  try {
    return await fetchYahooSymbolIndicators(symbol);
  } catch (error) {
    errors.push(`yahoo: ${error.message}`);
  }

  throw new Error(errors.join(' || '));
}

async function refreshIndicators(symbols = DEFAULT_SYMBOLS) {
  const startedAt = Date.now();
  try {
    const batches = await Promise.allSettled(symbols.map((symbol) => fetchSymbolIndicators(symbol)));
    const snapshots = batches
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const failures = batches
      .map((result, index) => ({ result, symbol: symbols[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ result, symbol }) => ({ symbol, error: result.reason?.message || String(result.reason) }));

    snapshots.forEach((snapshot) => {
      runtimeCache.indicators[snapshot.symbol] = snapshot;
    });
    runtimeCache.status.lastIndicatorsRefreshAt = new Date().toISOString();

    let persisted = false;
    let persistError = null;

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

      if (error) {
        persistError = error.message;
        updateDbStatus('indicators', false, { error: error.message });
      } else {
        persisted = true;
        updateDbStatus('indicators', true, { writeCount: rows.length, failures });
      }
    } else if (failures.length > 0) {
      updateDbStatus('indicators', false, { error: 'No indicator snapshots generated', failures });
    }

    await recordRefreshRun(failures.length === symbols.length ? 'indicators' : 'indicators', persistError ? 'partial' : 'success', {
      count: snapshots.length,
      persisted,
      persistError,
      providers: [...new Set(snapshots.map((item) => item.provider))],
      failures,
      durationMs: Date.now() - startedAt,
      symbols,
    });

    return { ok: true, count: snapshots.length, persisted, persistError, failures, data: snapshots };
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

    let persisted = false;
    let persistError = null;

    if (isSupabaseEnabled()) {
      const { error } = await supabase.from('market_macro_snapshots').insert({
        source: macro.source,
        payload: macro,
        fetched_at: macro.updatedAt || new Date().toISOString(),
      });

      if (error) {
        persistError = error.message;
        updateDbStatus('macro', false, { error: error.message });
      } else {
        persisted = true;
        updateDbStatus('macro', true);
      }
    }

    await recordRefreshRun('macro', persistError ? 'partial' : 'success', {
      persisted,
      persistError,
      durationMs: Date.now() - startedAt,
      source: macro.source,
    });

    return { ok: true, persisted, persistError, data: macro };
  } catch (error) {
    await recordRefreshRun('macro', 'error', { message: error.message });
    throw error;
  }
}

async function getTableCount(table) {
  if (!isSupabaseEnabled()) return { ok: false, count: null, error: 'supabase-disabled' };
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) return { ok: false, count: null, error: error.message };
  return { ok: true, count };
}

async function getLiveStatus() {
  let dbStatus = [];
  let refreshRunsError = null;
  let tables = null;

  if (isSupabaseEnabled()) {
    const { data, error } = await supabase
      .from('market_refresh_runs')
      .select('kind,status,ran_at,metadata')
      .order('ran_at', { ascending: false })
      .limit(10);

    if (error) {
      refreshRunsError = error.message;
      updateDbStatus('refreshRuns', false, { error: error.message });
    } else {
      dbStatus = data || [];
      updateDbStatus('refreshRuns', true, { readCount: dbStatus.length });
    }

    const [marketNews, marketIndicators, marketMacro, marketRefreshRuns] = await Promise.all([
      getTableCount('market_news'),
      getTableCount('market_indicator_snapshots'),
      getTableCount('market_macro_snapshots'),
      getTableCount('market_refresh_runs'),
    ]);

    tables = {
      market_news: marketNews,
      market_indicator_snapshots: marketIndicators,
      market_macro_snapshots: marketMacro,
      market_refresh_runs: marketRefreshRuns,
    };
  }

  return {
    supabase: isSupabaseEnabled(),
    cache: runtimeCache.status,
    db: runtimeCache.db,
    tables,
    lastRuns: dbStatus,
    refreshRunsError,
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
