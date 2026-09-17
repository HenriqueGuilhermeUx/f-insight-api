'use strict';

const enrichment = require('../src/services/advisorMarketEnrichment');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function fakeBundle(symbol) {
  const prices = { PETR4: 43.5, VALE3: 64.2, BOVA11: 151.4 };
  const price = prices[symbol] || 100;
  return {
    generatedAt: '2026-09-17T00:00:00.000Z',
    quote: { provider: 'fake', price },
    analytics: {
      observations: 252,
      lastPrice: price,
      trend: symbol === 'PETR4' ? 'alta' : 'lateral/mista',
      volatility: { hv20: 0.25, hv60: 0.29, hv120: 0.31, hv252: 0.33 },
      annualizedDrift: 0.08,
      maxDrawdown: -0.18,
    },
    history: { selectedProvider: 'fake' },
    errors: [],
  };
}

async function main() {
  const portfolio = await enrichment.enrichPortfolio({
    clientId: 'c1',
    holdings: [
      { symbol: 'PETR4', quantity: 1000, assetClass: 'stock', sector: 'energy', currency: 'BRL' },
      { symbol: 'VALE3', quantity: 200, assetClass: 'stock', sector: 'materials', currency: 'BRL' },
    ],
  }, { fetchBundle: fakeBundle, concurrency: 2 });

  assert(portfolio.enrichment.succeeded === 2, 'two holdings should enrich');
  assert(portfolio.positions.length === 2, 'two positions should be analyzed');
  assert(portfolio.holdings[0].marketData.volatility.hv60 === 0.29, 'volatility should be retained');
  assert(portfolio.totalMarketValue > 0, 'market value should use enriched prices');

  const stressed = await enrichment.enrichAndStressPortfolio({
    clientId: 'c1',
    holdings: [
      { symbol: 'PETR4', quantity: 1000, assetClass: 'stock', sector: 'energy', currency: 'BRL' },
      { symbol: 'VALE3', quantity: 200, assetClass: 'stock', sector: 'materials', currency: 'BRL' },
    ],
    scenario: { name: 'equity shock', assetClassShocks: { stock: -0.10 } },
  }, { fetchBundle: fakeBundle });
  assert(stressed.stress.pnl < 0, 'negative stock shock should produce negative scenario PnL');

  const book = await enrichment.enrichAdvisorBook({
    scenario: { assetClassShocks: { stock: -0.10 } },
    clients: [
      { clientId: 'c1', holdings: [{ symbol: 'PETR4', quantity: 100, assetClass: 'stock', sector: 'energy', currency: 'BRL' }] },
      { clientId: 'c2', holdings: [{ symbol: 'BOVA11', quantity: 20, assetClass: 'stock', sector: 'broad-market', currency: 'BRL' }] },
    ],
  }, { fetchBundle: fakeBundle });
  assert(book.clientCount === 2, 'two clients should be analyzed');
  assert(book.enrichment.holdingsSucceeded === 2, 'two holdings should enrich in book');

  console.log(JSON.stringify({
    ok: true,
    portfolio: {
      totalMarketValue: portfolio.totalMarketValue,
      enrichment: portfolio.enrichment,
      topPosition: portfolio.positions[0],
    },
    stress: { pnl: stressed.stress.pnl, pnlPct: stressed.stress.pnlPct },
    book: { clientCount: book.clientCount, aggregate: book.aggregate, enrichment: book.enrichment },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
