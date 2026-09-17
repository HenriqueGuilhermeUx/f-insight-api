'use strict';

const marketTerminal = require('./marketTerminalEngine');
const advisor = require('./advisorIntelligenceEngine');

const NOTICE = 'Market-enriched advisor analytics are internal research outputs and are not investment recommendations.';

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function normalizeInputHolding(holding = {}) {
  return {
    ...holding,
    symbol: String(holding.symbol || holding.ticker || '').trim().toUpperCase(),
  };
}

async function enrichHolding(holding, options = {}) {
  const input = normalizeInputHolding(holding);
  if (!input.symbol) return { ...input, enrichmentError: 'symbol required' };
  const fetchBundle = options.fetchBundle || marketTerminal.buildAssetResearchBundle;
  try {
    const bundle = await fetchBundle(input.symbol, {
      range: options.range || '1y',
      interval: '1d',
      quote: true,
      news: false,
      macro: false,
      externalSentiment: false,
    });
    const price = Number(bundle?.quote?.price ?? bundle?.analytics?.lastPrice ?? input.price ?? 0);
    return {
      ...input,
      price: Number.isFinite(price) ? price : Number(input.price || 0),
      marketData: {
        provider: bundle?.history?.selectedProvider || bundle?.history?.provider || bundle?.quote?.provider || null,
        observations: bundle?.analytics?.observations || 0,
        trend: bundle?.analytics?.trend || null,
        volatility: bundle?.analytics?.volatility || null,
        annualizedDrift: bundle?.analytics?.annualizedDrift ?? null,
        maxDrawdown: bundle?.analytics?.maxDrawdown ?? null,
        fetchedAt: bundle?.generatedAt || null,
      },
      sourceErrors: bundle?.errors || [],
    };
  } catch (error) {
    return {
      ...input,
      enrichmentError: error.message,
      sourceErrors: [{ capability: 'market-enrichment', message: error.message }],
    };
  }
}

async function enrichPortfolio(payload = {}, options = {}) {
  const holdings = Array.isArray(payload.holdings) ? payload.holdings : [];
  const enrichedHoldings = await mapWithConcurrency(holdings, options.concurrency || 4, (holding) => enrichHolding(holding, options));
  const analysis = advisor.analyzePortfolio({ ...payload, holdings: enrichedHoldings });
  return {
    ...analysis,
    enriched: true,
    holdings: enrichedHoldings,
    enrichment: {
      requested: holdings.length,
      succeeded: enrichedHoldings.filter((item) => !item.enrichmentError).length,
      failed: enrichedHoldings.filter((item) => item.enrichmentError).length,
    },
    notice: NOTICE,
  };
}

async function enrichAndStressPortfolio(payload = {}, options = {}) {
  const enriched = await enrichPortfolio(payload, options);
  const stressed = advisor.stressPortfolio({
    ...payload,
    holdings: enriched.holdings,
    scenario: payload.scenario || {},
  });
  return {
    ok: true,
    enrichedPortfolio: enriched,
    stress: stressed,
    notice: NOTICE,
  };
}

async function enrichAdvisorBook(payload = {}, options = {}) {
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const enrichedClients = await mapWithConcurrency(clients, options.clientConcurrency || 2, async (client) => {
    const enriched = await enrichPortfolio({
      clientId: client.clientId || client.id,
      portfolioId: client.portfolioId,
      holdings: client.holdings || [],
    }, options);
    return {
      ...client,
      holdings: enriched.holdings,
      enrichment: enriched.enrichment,
    };
  });
  const book = advisor.analyzeAdvisorBook({
    ...payload,
    clients: enrichedClients,
  });
  return {
    ...book,
    enrichment: {
      clientsRequested: clients.length,
      holdingsRequested: enrichedClients.reduce((sum, client) => sum + (client.enrichment?.requested || 0), 0),
      holdingsSucceeded: enrichedClients.reduce((sum, client) => sum + (client.enrichment?.succeeded || 0), 0),
      holdingsFailed: enrichedClients.reduce((sum, client) => sum + (client.enrichment?.failed || 0), 0),
    },
    notice: NOTICE,
  };
}

module.exports = {
  NOTICE,
  mapWithConcurrency,
  enrichHolding,
  enrichPortfolio,
  enrichAndStressPortfolio,
  enrichAdvisorBook,
};
