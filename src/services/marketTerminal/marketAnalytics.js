'use strict';

function finite(values = []) {
  return values.map(Number).filter(Number.isFinite);
}

function mean(values = []) {
  const xs = finite(values);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0;
}

function sampleStdDev(values = []) {
  const xs = finite(values);
  if (xs.length < 2) return 0;
  const avg = mean(xs);
  const variance = xs.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function logReturns(closes = []) {
  const xs = finite(closes).filter((value) => value > 0);
  const returns = [];
  for (let i = 1; i < xs.length; i += 1) returns.push(Math.log(xs[i] / xs[i - 1]));
  return returns;
}

function annualizedVolatility(closes = [], tradingDays = 252) {
  const returns = logReturns(closes);
  return sampleStdDev(returns) * Math.sqrt(tradingDays);
}

function annualizedDrift(closes = [], tradingDays = 252) {
  const returns = logReturns(closes);
  return mean(returns) * tradingDays;
}

function simpleMovingAverage(values = [], window = 20) {
  const xs = finite(values);
  const slice = xs.slice(-Math.max(1, window));
  return slice.length ? mean(slice) : null;
}

function maxDrawdown(closes = []) {
  const xs = finite(closes).filter((value) => value > 0);
  if (!xs.length) return 0;
  let peak = xs[0];
  let worst = 0;
  for (const price of xs) {
    peak = Math.max(peak, price);
    worst = Math.min(worst, (price / peak) - 1);
  }
  return worst;
}

function percentile(values = [], p = 0.5) {
  const xs = finite(values).sort((a, b) => a - b);
  if (!xs.length) return null;
  const index = Math.min(xs.length - 1, Math.max(0, Math.round((xs.length - 1) * p)));
  return xs[index];
}

function summarizeHistory(history = {}) {
  const rows = Array.isArray(history?.rows) ? history.rows : [];
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  const returns = logReturns(closes);
  const last = closes.length ? closes[closes.length - 1] : null;
  const sma20 = simpleMovingAverage(closes, 20);
  const sma60 = simpleMovingAverage(closes, 60);
  const hv20 = annualizedVolatility(closes.slice(-21));
  const hv60 = annualizedVolatility(closes.slice(-61));
  const hv120 = annualizedVolatility(closes.slice(-121));
  const hv252 = annualizedVolatility(closes.slice(-253));
  let trend = 'indefinida';
  if (last && sma20 && sma60) {
    if (last > sma20 && sma20 > sma60) trend = 'alta';
    else if (last < sma20 && sma20 < sma60) trend = 'baixa';
    else trend = 'lateral/mista';
  }

  return {
    observations: closes.length,
    lastPrice: last,
    sma20,
    sma60,
    trend,
    annualizedDrift: annualizedDrift(closes),
    volatility: { hv20, hv60, hv120, hv252 },
    maxDrawdown: maxDrawdown(closes),
    dailyReturnDistribution: {
      p05: percentile(returns, 0.05),
      p25: percentile(returns, 0.25),
      p50: percentile(returns, 0.50),
      p75: percentile(returns, 0.75),
      p95: percentile(returns, 0.95),
    },
  };
}

module.exports = {
  mean,
  sampleStdDev,
  logReturns,
  annualizedVolatility,
  annualizedDrift,
  simpleMovingAverage,
  maxDrawdown,
  summarizeHistory,
};
