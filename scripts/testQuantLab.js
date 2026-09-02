'use strict';

const quantLab = require('../src/services/quantLabEngine');

const sample = {
  symbol: 'PETR4',
  spot: 42.1,
  daysToExpiry: 90,
  riskFreeRate: 0.12,
  annualVolatility: 0.34,
  annualDrift: 0.08,
  simulations: 10000,
  options: [
    { symbol: 'PETR4C450', type: 'call', strike: 45, premium: 1.2, bid: 1.1, ask: 1.3, volume: 18000, openInterest: 120000 },
    { symbol: 'PETR4C500', type: 'call', strike: 50, premium: 0.45, bid: 0.42, ask: 0.48, volume: 9000, openInterest: 76000 },
    { symbol: 'PETR4P380', type: 'put', strike: 38, premium: 0.75, bid: 0.7, ask: 0.82, volume: 6000, openInterest: 42000 },
  ],
};

const result = quantLab.runManualScan(sample);
console.log(JSON.stringify({
  ok: result.ok,
  engine: result.engine,
  assumptions: result.assumptions,
  top: result.top.map((item) => ({
    symbol: item.symbol,
    type: item.type,
    strike: item.strike,
    score: item.score,
    label: item.label,
    marketProbabilityPct: Number((item.riskNeutralProbability * 100).toFixed(2)),
    modelProbabilityPct: Number((item.modelProbability * 100).toFixed(2)),
    edgePct: Number((item.edge * 100).toFixed(2)),
  })),
  riskNotice: result.riskNotice,
}, null, 2));
