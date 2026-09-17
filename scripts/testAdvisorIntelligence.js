'use strict';

const advisor = require('../src/services/advisorIntelligenceEngine');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

const portfolio = {
  clientId: 'client-001',
  holdings: [
    { symbol: 'PETR4', quantity: 1000, price: 42, assetClass: 'stock', sector: 'energy', currency: 'BRL' },
    { symbol: 'VALE3', quantity: 300, price: 62, assetClass: 'stock', sector: 'materials', currency: 'BRL' },
    { symbol: 'BOVA11', quantity: 120, price: 150, assetClass: 'etf', sector: 'broad-market', currency: 'BRL' },
    { symbol: 'BTC', quantity: 0.03, price: 600000, assetClass: 'crypto', sector: 'crypto', currency: 'BRL' },
  ],
};

const analysis = advisor.analyzePortfolio(portfolio);
assert(analysis.positionCount === 4, 'should analyze four holdings');
assert(analysis.totalMarketValue > 0, 'market value should be positive');
assert(analysis.positions[0].weight > 0, 'weights should be calculated');
assert(analysis.concentration.hhi > 0, 'HHI should be calculated');

const stress = advisor.stressPortfolio({
  ...portfolio,
  scenario: {
    name: 'test shock',
    assetClassShocks: { stock: -0.10, crypto: -0.20 },
    symbolShocks: { PETR4: -0.05 },
  },
});
assert(stress.stressedValue < stress.baseValue, 'negative scenario should reduce portfolio value');
assert(stress.pnl < 0, 'scenario PnL should be negative');

const book = advisor.analyzeAdvisorBook({
  impactThreshold: 0.02,
  scenario: { assetClassShocks: { stock: -0.10, crypto: -0.20 } },
  clients: [
    { clientId: 'c1', name: 'Cliente 1', holdings: portfolio.holdings },
    { clientId: 'c2', name: 'Cliente 2', holdings: [{ symbol: 'TESOURO', marketValue: 100000, assetClass: 'fixed-income', sector: 'sovereign', currency: 'BRL' }] },
  ],
});
assert(book.clientCount === 2, 'book should analyze two clients');
assert(book.affectedClients >= 1, 'at least one client should be affected');
assert(book.aggregate.baseValue > 0, 'aggregate base should be positive');

console.log(JSON.stringify({
  ok: true,
  portfolio: {
    totalMarketValue: analysis.totalMarketValue,
    concentration: analysis.concentration,
    observations: analysis.observations,
  },
  stress: {
    pnl: stress.pnl,
    pnlPct: stress.pnlPct,
    largestNegativeContributors: stress.largestNegativeContributors,
  },
  book: {
    clientCount: book.clientCount,
    affectedClients: book.affectedClients,
    aggregate: book.aggregate,
  },
  scenarios: advisor.scenarioLibrary(),
}, null, 2));
