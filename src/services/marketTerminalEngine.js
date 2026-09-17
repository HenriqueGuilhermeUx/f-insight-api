'use strict';

const finnhub = require('./marketTerminal/providers/finnhubProvider');
const openbb = require('./marketTerminal/providers/openbbProvider');
const yahoo = require('./marketTerminal/providers/yahooProvider');
const bcb = require('./marketTerminal/providers/bcbProvider');
const cvm = require('./marketTerminal/providers/cvmProvider');
const sentiment = require('./marketTerminal/sentimentEngine');
const analytics = require('./marketTerminal/marketAnalytics');

const INTERNAL_NOTICE = 'Internal research engine. Not a recommendation, signal, solicitation, or order execution service.';

function providerStatus() {
  return {
    finnhub: {
      enabled: finnhub.isEnabled(),
      role: ['quote', 'symbol-search', 'company-news'],
    },
    yahoo: {
      enabled: true,
      role: ['historical-prices', 'fallback-quote', 'brasil-prototype'],
    },
    openbb: {
      enabled: openbb.isEnabled(),
      role: ['historical-prices', 'provider-hub'],
      config: openbb.config(),
    },
    bcb: {
      enabled: true,
      role: ['selic', 'usdbrl', 'ipca', 'macro-brasil'],
    },
    cvm: {
      enabled: true,
      role: ['company-registry', 'regulatory-source-catalog'],
      sources: cvm.sourceCatalog(),
    },
    adanos: {
      enabled: sentiment.isAdanosEnabled(),
      role: ['external-sentiment'],
      config: {
        baseUrl: sentiment.adanosConfig().baseUrl || null,
        stockPath: sentiment.adanosConfig().stockPath || null,
      },
    },
  };
}

function normalizeTextSentiment(items = []) {
  return items.map((item) => {
    if (typeof item === 'number') return { score: item };
    return {
      score: Number(item?.score || 0),
      title: item?.title || item?.headline || '',
      source: item?.source || '',
      url: item?.url || '',
      publishedAt: item?.publishedAt || null,
    };
  });
}

async function loadHistory(symbol, options, result) {
  if (options.history === false) return null;

  if (openbb.isEnabled()) {
    try {
      const history = await openbb.getHistoricalPrices(symbol, {
        startDate: options.startDate,
        endDate: options.endDate,
        interval: options.interval || '1d',
        provider: options.openbbProvider,
      });
      return { ...history, selectedProvider: 'openbb' };
    } catch (error) {
      result.errors.push({ provider: 'openbb', capability: 'historical-prices', message: error.message });
    }
  }

  try {
    const history = await yahoo.getHistoricalPrices(symbol, {
      range: options.range || '1y',
      interval: options.interval || '1d',
    });
    return { ...history, selectedProvider: 'yahoo' };
  } catch (error) {
    result.errors.push({ provider: 'yahoo', capability: 'historical-prices', message: error.message });
    return null;
  }
}

async function buildAssetResearchBundle(symbol, options = {}) {
  const result = {
    ok: true,
    mode: 'internal-market-terminal',
    symbol,
    generatedAt: new Date().toISOString(),
    providers: providerStatus(),
    quote: null,
    history: null,
    analytics: null,
    macro: null,
    news: [],
    sentiment: null,
    errors: [],
    notice: INTERNAL_NOTICE,
  };

  if (options.quote !== false && finnhub.isEnabled()) {
    try {
      result.quote = await finnhub.getQuote(symbol);
    } catch (error) {
      result.errors.push({ provider: 'finnhub', capability: 'quote', message: error.message });
    }
  }

  if (options.news !== false && finnhub.isEnabled()) {
    try {
      result.news = await finnhub.getCompanyNews(symbol, options.newsFrom, options.newsTo);
    } catch (error) {
      result.errors.push({ provider: 'finnhub', capability: 'company-news', message: error.message });
    }
  }

  result.history = await loadHistory(symbol, options, result);
  if (result.history?.rows?.length) {
    result.analytics = analytics.summarizeHistory(result.history);
    if (!result.quote && result.history.last) {
      result.quote = {
        provider: result.history.provider || 'yahoo',
        symbol,
        price: result.history.last.close,
        timestamp: result.history.last.date,
        fallback: true,
      };
    }
  }

  if (options.macro !== false) {
    try {
      result.macro = await bcb.getMacroSnapshot();
    } catch (error) {
      result.errors.push({ provider: 'bcb', capability: 'macro-snapshot', message: error.message });
    }
  }

  let externalSentiment = null;
  if (options.externalSentiment !== false && sentiment.isAdanosEnabled()) {
    try {
      externalSentiment = await sentiment.getAdanosStockSentiment(symbol);
    } catch (error) {
      result.errors.push({ provider: 'adanos', capability: 'stock-sentiment', message: error.message });
    }
  }

  const supplied = options.sentiment || {};
  result.sentiment = sentiment.aggregateSentiment({
    news: normalizeTextSentiment(supplied.news || []),
    reddit: normalizeTextSentiment(supplied.reddit || externalSentiment?.reddit || []),
    x: normalizeTextSentiment(supplied.x || externalSentiment?.x || []),
    prediction: normalizeTextSentiment(supplied.prediction || externalSentiment?.prediction || externalSentiment?.polymarket || []),
    weights: supplied.weights,
  });

  result.ok = Boolean(result.quote || result.history || result.macro);
  return result;
}

function buildTradingViewWidgetPlan(symbol) {
  return {
    symbol,
    implementation: 'frontend-only',
    rule: 'Use official embeddable widgets/components and respect provider terms; do not proxy or redistribute widget data through this backend.',
    widgets: [
      'advanced-chart',
      'technical-analysis',
      'symbol-info',
      'market-overview',
      'stock-heatmap',
      'company-profile',
      'financials',
      'top-stories',
    ],
  };
}

function architecturePlan() {
  return {
    marketData: ['Finnhub', 'Yahoo prototype', 'OpenBB providers', 'BCB', 'CVM', 'future B3 licensed provider'],
    visualization: ['TradingView embeddable widgets on frontend'],
    intelligence: ['F-Insight Agent', 'sentimentEngine', 'Quant Lab'],
    researchSignals: ['news', 'reddit', 'x', 'prediction-market context'],
    analytics: ['historical volatility', 'annualized drift', 'moving averages', 'max drawdown'],
    storage: ['Supabase/Postgres cache after validation'],
    publicationStatus: 'internal-only',
  };
}

module.exports = {
  INTERNAL_NOTICE,
  providerStatus,
  buildAssetResearchBundle,
  buildTradingViewWidgetPlan,
  architecturePlan,
  bcb,
  cvm,
  analytics,
};
