'use strict';

const finnhub = require('./marketTerminal/providers/finnhubProvider');
const openbb = require('./marketTerminal/providers/openbbProvider');
const sentiment = require('./marketTerminal/sentimentEngine');

const INTERNAL_NOTICE = 'Internal research engine. Not a recommendation, signal, solicitation, or order execution service.';

function providerStatus() {
  return {
    finnhub: {
      enabled: finnhub.isEnabled(),
      role: ['quote', 'symbol-search', 'company-news'],
    },
    openbb: {
      enabled: openbb.isEnabled(),
      role: ['historical-prices', 'provider-hub'],
      config: openbb.config(),
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

async function buildAssetResearchBundle(symbol, options = {}) {
  const result = {
    ok: true,
    mode: 'internal-market-terminal',
    symbol,
    generatedAt: new Date().toISOString(),
    providers: providerStatus(),
    quote: null,
    history: null,
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

  if (options.history !== false && openbb.isEnabled()) {
    try {
      result.history = await openbb.getHistoricalPrices(symbol, {
        startDate: options.startDate,
        endDate: options.endDate,
        interval: options.interval || '1d',
        provider: options.openbbProvider,
      });
    } catch (error) {
      result.errors.push({ provider: 'openbb', capability: 'historical-prices', message: error.message });
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
    marketData: ['Finnhub', 'OpenBB providers', 'BCB', 'CVM', 'future B3 licensed provider'],
    visualization: ['TradingView embeddable widgets on frontend'],
    intelligence: ['F-Insight Agent', 'sentimentEngine', 'Quant Lab'],
    researchSignals: ['news', 'reddit', 'x', 'prediction-market context'],
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
};
