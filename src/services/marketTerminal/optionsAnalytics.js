'use strict';

const quantLab = require('../quantLabEngine');

function n(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function years(days) {
  return Math.max(1 / 365, n(days, 30) / 365);
}

function greeks({ type = 'call', spot, strike, daysToExpiry, riskFreeRate = 0.12, annualVolatility = 0.32 }) {
  const cleanType = String(type).toLowerCase() === 'put' ? 'put' : 'call';
  const s = Math.max(0.0001, n(spot));
  const k = Math.max(0.0001, n(strike));
  const t = years(daysToExpiry);
  const r = n(riskFreeRate, 0.12);
  const sigma = Math.max(0.0001, n(annualVolatility, 0.32));
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf = normalPdf(d1);

  const delta = cleanType === 'call' ? quantLab.normalCdf(d1) : quantLab.normalCdf(d1) - 1;
  const gamma = pdf / (s * sigma * sqrtT);
  const vega = (s * pdf * sqrtT) / 100;
  const callTheta = (-(s * pdf * sigma) / (2 * sqrtT) - r * k * Math.exp(-r * t) * quantLab.normalCdf(d2)) / 365;
  const putTheta = (-(s * pdf * sigma) / (2 * sqrtT) + r * k * Math.exp(-r * t) * quantLab.normalCdf(-d2)) / 365;
  const callRho = (k * t * Math.exp(-r * t) * quantLab.normalCdf(d2)) / 100;
  const putRho = (-k * t * Math.exp(-r * t) * quantLab.normalCdf(-d2)) / 100;

  return {
    delta,
    gamma,
    thetaPerDay: cleanType === 'call' ? callTheta : putTheta,
    vegaPerVolPoint: vega,
    rhoPerRatePoint: cleanType === 'call' ? callRho : putRho,
    d1,
    d2,
  };
}

function payoffAtExpiry({ type = 'call', strike, premium = 0, quantity = 1 }, terminalPrice) {
  const cleanType = String(type).toLowerCase() === 'put' ? 'put' : 'call';
  const k = n(strike);
  const p = n(premium);
  const q = Math.max(0, n(quantity, 1));
  const intrinsic = cleanType === 'call' ? Math.max(0, terminalPrice - k) : Math.max(0, k - terminalPrice);
  return (intrinsic - p) * q;
}

function analyzeLongOption(payload = {}) {
  const type = String(payload.type).toLowerCase() === 'put' ? 'put' : 'call';
  const spot = n(payload.spot);
  const strike = n(payload.strike);
  const premium = Math.max(0, n(payload.premium));
  const daysToExpiry = n(payload.daysToExpiry, 30);
  const annualVolatility = n(payload.annualVolatility, quantLab.DEFAULTS.annualVolatility);
  const annualDrift = n(payload.annualDrift, quantLab.DEFAULTS.annualDrift);
  const riskFreeRate = n(payload.riskFreeRate, quantLab.DEFAULTS.riskFreeRate);
  const simulations = n(payload.simulations, quantLab.DEFAULTS.simulations);
  const breakEven = type === 'call' ? strike + premium : Math.max(0, strike - premium);
  const terminals = quantLab.monteCarloTerminalPrices({
    symbol: payload.symbol || 'OPTION',
    spot,
    daysToExpiry,
    annualVolatility,
    annualDrift,
    simulations,
  });
  const profits = terminals.map((terminal) => payoffAtExpiry({ type, strike, premium }, terminal));
  const positive = profits.filter((profit) => profit > 0).length;
  const expectedPnL = profits.reduce((sum, value) => sum + value, 0) / Math.max(1, profits.length);
  const sorted = [...profits].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))] ?? 0;
  const iv = premium > 0 ? quantLab.impliedVolatility({ type, spot, strike, premium, daysToExpiry, riskFreeRate }) : null;

  return {
    symbol: payload.symbol || null,
    type,
    spot,
    strike,
    premium,
    daysToExpiry,
    breakEven,
    maxLossPerUnit: premium,
    maxGainPerUnit: type === 'call' ? null : Math.max(0, strike - premium),
    maxGainDescription: type === 'call' ? 'teoricamente ilimitado para uma call comprada' : 'limitado pela queda do ativo ate zero',
    impliedVolatility: iv,
    greeks: greeks({ type, spot, strike, daysToExpiry, riskFreeRate, annualVolatility: iv || annualVolatility }),
    model: {
      annualVolatility,
      annualDrift,
      simulations: terminals.length,
      probabilityOfProfit: positive / Math.max(1, terminals.length),
      expectedPnLPerUnit: expectedPnL,
      pnlDistribution: { p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    },
    notice: 'Simulacao educacional. Gregas e probabilidades dependem das premissas e nao constituem recomendacao.',
  };
}

module.exports = { greeks, payoffAtExpiry, analyzeLongOption };
