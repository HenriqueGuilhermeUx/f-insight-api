'use strict';

const RISK_NOTICE = 'Motor educacional. Nao recomenda compra ou venda, nao promete rentabilidade e nao executa ordens.';

const DEFAULTS = {
  riskFreeRate: 0.12,
  annualVolatility: 0.32,
  annualDrift: 0.08,
  simulations: 25000,
};

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return fallback;
  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');
  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (commaIndex >= 0) {
    text = text.replace(',', '.');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function yearsFromDays(daysToExpiry) {
  return Math.max(1 / 365, toNumber(daysToExpiry, 30) / 365);
}

function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

function blackScholesPrice({ type = 'call', spot, strike, daysToExpiry, riskFreeRate = DEFAULTS.riskFreeRate, annualVolatility = DEFAULTS.annualVolatility }) {
  const s = Math.max(0.0001, toNumber(spot));
  const k = Math.max(0.0001, toNumber(strike));
  const t = yearsFromDays(daysToExpiry);
  const r = toNumber(riskFreeRate, DEFAULTS.riskFreeRate);
  const sigma = Math.max(0.0001, toNumber(annualVolatility, DEFAULTS.annualVolatility));
  const d1 = (Math.log(s / k) + (r + (sigma * sigma) / 2) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  if (String(type).toLowerCase() === 'put') {
    return k * Math.exp(-r * t) * normalCdf(-d2) - s * normalCdf(-d1);
  }
  return s * normalCdf(d1) - k * Math.exp(-r * t) * normalCdf(d2);
}

function impliedVolatility({ type = 'call', spot, strike, daysToExpiry, premium, riskFreeRate = DEFAULTS.riskFreeRate }) {
  const target = Math.max(0, toNumber(premium));
  if (!target) return null;
  let low = 0.0001;
  let high = 5;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const price = blackScholesPrice({ type, spot, strike, daysToExpiry, riskFreeRate, annualVolatility: mid });
    if (price > target) high = mid;
    else low = mid;
  }
  return clamp((low + high) / 2, 0.0001, 5);
}

function riskNeutralProbability({ type = 'call', spot, strike, daysToExpiry, riskFreeRate = DEFAULTS.riskFreeRate, annualVolatility = DEFAULTS.annualVolatility }) {
  const s = Math.max(0.0001, toNumber(spot));
  const k = Math.max(0.0001, toNumber(strike));
  const t = yearsFromDays(daysToExpiry);
  const r = toNumber(riskFreeRate, DEFAULTS.riskFreeRate);
  const sigma = Math.max(0.0001, toNumber(annualVolatility, DEFAULTS.annualVolatility));
  const d2 = (Math.log(s / k) + (r - (sigma * sigma) / 2) * t) / (sigma * Math.sqrt(t));
  return String(type).toLowerCase() === 'put' ? normalCdf(-d2) : normalCdf(d2);
}

function createSeededRandom(seedText = 'finsight') {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return function random() {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianPair(random) {
  const u1 = Math.max(1e-12, random());
  const u2 = Math.max(1e-12, random());
  const mag = Math.sqrt(-2.0 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

function monteCarloTerminalPrices({ symbol = 'ASSET', spot, daysToExpiry, annualVolatility = DEFAULTS.annualVolatility, annualDrift = DEFAULTS.annualDrift, simulations = DEFAULTS.simulations }) {
  const s = Math.max(0.0001, toNumber(spot));
  const t = yearsFromDays(daysToExpiry);
  const sigma = Math.max(0.0001, toNumber(annualVolatility, DEFAULTS.annualVolatility));
  const drift = toNumber(annualDrift, DEFAULTS.annualDrift);
  const n = clamp(Math.round(toNumber(simulations, DEFAULTS.simulations)), 1000, 100000);
  const random = createSeededRandom(`${symbol}-${s}-${t}-${sigma}-${drift}-${n}`);
  const prices = [];

  while (prices.length < n) {
    const [z1, z2] = gaussianPair(random);
    for (const z of [z1, z2]) {
      if (prices.length >= n) break;
      const terminal = s * Math.exp((drift - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
      prices.push(terminal);
    }
  }
  prices.sort((a, b) => a - b);
  return prices;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = clamp(Math.round((sortedValues.length - 1) * p), 0, sortedValues.length - 1);
  return sortedValues[index];
}

function analyzeOption({ symbol = 'ASSET', type = 'call', spot, strike, premium, daysToExpiry, annualVolatility, annualDrift, riskFreeRate, volume = 0, openInterest = 0, bid = null, ask = null, simulations }) {
  const cleanType = String(type || 'call').toLowerCase() === 'put' ? 'put' : 'call';
  const s = Math.max(0.0001, toNumber(spot));
  const k = Math.max(0.0001, toNumber(strike));
  const optionPremium = Math.max(0, toNumber(premium));
  const iv = impliedVolatility({ type: cleanType, spot: s, strike: k, daysToExpiry, premium: optionPremium, riskFreeRate });
  const modelVol = annualVolatility ? toNumber(annualVolatility, DEFAULTS.annualVolatility) : (iv || DEFAULTS.annualVolatility);
  const rnProb = riskNeutralProbability({ type: cleanType, spot: s, strike: k, daysToExpiry, riskFreeRate, annualVolatility: iv || modelVol });
  const prices = monteCarloTerminalPrices({ symbol, spot: s, daysToExpiry, annualVolatility: modelVol, annualDrift, simulations });
  const hits = prices.filter((price) => cleanType === 'call' ? price > k : price < k).length;
  const modelProbability = hits / prices.length;
  const edge = modelProbability - rnProb;
  const spread = bid !== null && ask !== null ? Math.max(0, toNumber(ask) - toNumber(bid)) : null;
  const liquidityScore = clamp((Math.log10(Math.max(1, toNumber(volume)) + 1) * 14) + (Math.log10(Math.max(1, toNumber(openInterest)) + 1) * 10) - (spread ? spread * 8 : 0), 0, 100);
  const edgeScore = clamp(edge * 500 + 50, 0, 100);
  const probabilityScore = clamp(modelProbability * 100, 0, 100);
  const score = Math.round(clamp(edgeScore * 0.55 + liquidityScore * 0.30 + probabilityScore * 0.15, 0, 100));

  let label = 'Neutra para estudo';
  if (edge > 0.10) label = 'Assimetria muito forte para estudo';
  else if (edge > 0.05) label = 'Assimetria forte para estudo';
  else if (edge > 0.02) label = 'Assimetria moderada para estudo';
  else if (edge < -0.05) label = 'Mercado parece cobrar caro pelo cenário';

  return {
    symbol,
    type: cleanType,
    spot: s,
    strike: k,
    premium: optionPremium,
    daysToExpiry: Math.round(toNumber(daysToExpiry, 30)),
    impliedVolatility: iv,
    modelVolatility: modelVol,
    riskNeutralProbability: rnProb,
    modelProbability,
    edge,
    score,
    label,
    liquidity: {
      volume: toNumber(volume),
      openInterest: toNumber(openInterest),
      bid: bid === null ? null : toNumber(bid),
      ask: ask === null ? null : toNumber(ask),
      spread,
      score: Math.round(liquidityScore),
    },
    distribution: {
      p05: percentile(prices, 0.05),
      p25: percentile(prices, 0.25),
      p50: percentile(prices, 0.50),
      p75: percentile(prices, 0.75),
      p95: percentile(prices, 0.95),
    },
    interpretation: [
      `O mercado embute aproximadamente ${(rnProb * 100).toFixed(1)}% de probabilidade risk-neutral para o cenário do strike.`,
      `O modelo educacional simulou ${(modelProbability * 100).toFixed(1)}% usando Monte Carlo com volatilidade anual de ${(modelVol * 100).toFixed(1)}%.`,
      `Edge estimado: ${(edge * 100).toFixed(1)} pontos percentuais. Trate como hipotese de estudo, nao como indicacao.`,
    ],
    riskNotice: RISK_NOTICE,
  };
}

function runManualScan(payload = {}) {
  const options = Array.isArray(payload.options) ? payload.options : [];
  const base = {
    symbol: payload.symbol || payload.underlying || 'ASSET',
    spot: payload.spot || payload.underlyingPrice,
    daysToExpiry: payload.daysToExpiry,
    annualVolatility: payload.annualVolatility,
    annualDrift: payload.annualDrift,
    riskFreeRate: payload.riskFreeRate,
    simulations: payload.simulations,
  };

  const rows = options.map((option) => analyzeOption({ ...base, ...option, symbol: option.symbol || base.symbol }));
  rows.sort((a, b) => b.score - a.score);

  return {
    ok: true,
    engine: 'finsight-quant-lab-manual-scan',
    generatedAt: new Date().toISOString(),
    assumptions: {
      riskFreeRate: toNumber(base.riskFreeRate, DEFAULTS.riskFreeRate),
      annualVolatility: toNumber(base.annualVolatility, DEFAULTS.annualVolatility),
      annualDrift: toNumber(base.annualDrift, DEFAULTS.annualDrift),
      simulations: clamp(Math.round(toNumber(base.simulations, DEFAULTS.simulations)), 1000, 100000),
    },
    count: rows.length,
    top: rows.slice(0, 10),
    all: rows,
    riskNotice: RISK_NOTICE,
  };
}

function sourcePlan() {
  return {
    officialB3: [
      'Market Data B3 via distribuidores licenciados para cotações e cadeia de opções em tempo real ou delay.',
      'DataWise+ para dados analíticos de negociação, alocação, custódia e posições em aberto, com defasagem conforme pacote.',
      'UP2DATA para arquivos corporativos, risco, preços de referência, posições em aberto e dados para rotinas de marcação e risco.',
    ],
    openData: [
      'Banco Central SGS para Selic, IPCA, câmbio e séries macro.',
      'CVM para documentos, fatos relevantes e informações de emissores.',
      'OpenBB/yfinance como adapter de protótipo para histórico e alguns mercados fora Brasil.',
    ],
    productionGuidance: 'Começar com scan manual e histórico automático; contratar fonte B3/fornecedor autorizado antes de exibir cadeia de opções em produto comercial.',
  };
}

module.exports = {
  RISK_NOTICE,
  DEFAULTS,
  normalCdf,
  blackScholesPrice,
  impliedVolatility,
  riskNeutralProbability,
  monteCarloTerminalPrices,
  analyzeOption,
  runManualScan,
  sourcePlan,
};
