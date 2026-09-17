'use strict';

const quantLab = require('../quantLabEngine');

function n(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLeg(leg = {}) {
  return {
    type: String(leg.type).toLowerCase() === 'put' ? 'put' : 'call',
    side: String(leg.side).toLowerCase() === 'short' ? 'short' : 'long',
    strike: n(leg.strike),
    premium: Math.max(0, n(leg.premium)),
    quantity: Math.max(0.0001, n(leg.quantity, 1)),
  };
}

function intrinsic(type, strike, terminalPrice) {
  return type === 'put' ? Math.max(0, strike - terminalPrice) : Math.max(0, terminalPrice - strike);
}

function legPnl(leg, terminalPrice) {
  const normalized = normalizeLeg(leg);
  const gross = intrinsic(normalized.type, normalized.strike, terminalPrice) - normalized.premium;
  const signed = normalized.side === 'short' ? -gross : gross;
  return signed * normalized.quantity;
}

function strategyPnl(legs = [], terminalPrice) {
  return legs.reduce((sum, leg) => sum + legPnl(leg, terminalPrice), 0);
}

function detectRiskProfile(legs = []) {
  const normalized = legs.map(normalizeLeg);
  const nakedShortCall = normalized.some((leg) => leg.type === 'call' && leg.side === 'short') &&
    !normalized.some((leg) => leg.type === 'call' && leg.side === 'long' && leg.strike > 0);
  return {
    hasShortOptions: normalized.some((leg) => leg.side === 'short'),
    potentiallyUnboundedLoss: nakedShortCall,
  };
}

function analyzeStrategy(payload = {}) {
  const legs = Array.isArray(payload.legs) ? payload.legs.map(normalizeLeg) : [];
  if (!legs.length) throw new Error('At least one option leg is required');
  const spot = Math.max(0.0001, n(payload.spot));
  const daysToExpiry = n(payload.daysToExpiry, 30);
  const annualVolatility = n(payload.annualVolatility, quantLab.DEFAULTS.annualVolatility);
  const annualDrift = n(payload.annualDrift, quantLab.DEFAULTS.annualDrift);
  const simulations = n(payload.simulations, quantLab.DEFAULTS.simulations);
  const terminals = quantLab.monteCarloTerminalPrices({
    symbol: payload.symbol || 'STRATEGY',
    spot,
    daysToExpiry,
    annualVolatility,
    annualDrift,
    simulations,
  });
  const pnls = terminals.map((price) => strategyPnl(legs, price));
  const positive = pnls.filter((value) => value > 0).length;
  const expectedPnL = pnls.reduce((sum, value) => sum + value, 0) / pnls.length;
  const sortedPnL = [...pnls].sort((a, b) => a - b);
  const pct = (p) => sortedPnL[Math.min(sortedPnL.length - 1, Math.max(0, Math.round((sortedPnL.length - 1) * p)))] ?? 0;

  const lower = Math.max(0, spot * 0.25);
  const upper = spot * 2.5;
  const grid = Array.from({ length: 181 }, (_, index) => lower + ((upper - lower) * index / 180));
  const payoffGrid = grid.map((price) => ({ price, pnl: strategyPnl(legs, price) }));
  const gridPnls = payoffGrid.map((row) => row.pnl);
  const risk = detectRiskProfile(legs);

  return {
    ok: true,
    symbol: payload.symbol || null,
    spot,
    daysToExpiry,
    legs,
    model: {
      annualVolatility,
      annualDrift,
      simulations: terminals.length,
      probabilityOfProfit: positive / terminals.length,
      expectedPnL,
      pnlDistribution: { p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    },
    payoff: {
      sampledMinPnL: Math.min(...gridPnls),
      sampledMaxPnL: Math.max(...gridPnls),
      grid: payoffGrid,
      caveat: risk.potentiallyUnboundedLoss ? 'A grade finita nao captura integralmente perdas teoricamente ilimitadas.' : null,
    },
    risk,
    notice: 'Analise educacional de payoff. Nao e recomendacao de montagem, compra ou venda de opcoes.',
  };
}

module.exports = { normalizeLeg, legPnl, strategyPnl, analyzeStrategy, detectRiskProfile };
