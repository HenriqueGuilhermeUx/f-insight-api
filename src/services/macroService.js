const axios = require('axios');

const BCB_SERIES = {
  selicTarget: { code: 432, label: 'Selic Meta', unit: '% a.a.' },
  ipcaMonthly: { code: 433, label: 'IPCA Mensal', unit: '% m/m' },
  usdBrl: { code: 1, label: 'Dólar Comercial', unit: 'BRL' }
};

const CACHE_TTL_MS = 30 * 60 * 1000;

let macroCache = {
  updatedAt: null,
  source: 'unavailable',
  cacheTtlMinutes: CACHE_TTL_MS / 60000,
  indicators: [],
  observations: [],
  signals: [],
  degraded: true,
  failures: []
};
let lastRefreshAt = 0;
let inFlightRefresh = null;

function parseBcbValue(raw) {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchBcbLastValue(seriesKey) {
  const series = BCB_SERIES[seriesKey];
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series.code}/dados/ultimos/1?formato=json`;
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'F-Insight/1.0 (+https://f-insight.netlify.app)'
    }
  });
  const item = Array.isArray(response.data) ? response.data[0] : null;
  if (!item) throw new Error(`BCB series ${series.code} returned no data`);

  const value = parseBcbValue(item.valor);
  if (value === null) throw new Error(`BCB series ${series.code} returned invalid value`);

  return {
    value,
    date: item.data,
    label: series.label,
    unit: series.unit,
    source: `BCB SGS ${series.code}`
  };
}

function classifySelic(value) {
  if (value >= 11) return 'up';
  if (value <= 8) return 'down';
  return 'neutral';
}

function classifyIpca(value) {
  if (value >= 0.55) return 'up';
  if (value <= 0.2) return 'down';
  return 'neutral';
}

function classifyUsd(value) {
  if (value >= 5.4) return 'up';
  if (value <= 4.9) return 'down';
  return 'neutral';
}

function indicatorFromResult(id, result, interpretation, classify) {
  if (result.status !== 'fulfilled') return null;
  const data = result.value;
  return {
    id,
    label: data.label,
    value: data.value,
    unit: data.unit,
    date: data.date,
    source: data.source,
    trend: classify(data.value),
    interpretation
  };
}

function buildNeutralObservations(indicators) {
  const observations = [];
  const byId = new Map(indicators.map((item) => [item.id, item]));
  const selic = byId.get('selic');
  const ipca = byId.get('ipca');
  const usd = byId.get('usdbrl');

  if (selic) {
    observations.push({
      id: 'selic-context',
      topic: 'juros',
      title: 'Contexto de juros',
      summary: `A Selic de referência disponível é ${selic.value.toFixed(2).replace('.', ',')}% a.a.`,
      explanation: 'Taxas de juros influenciam custo de capital, desconto de fluxos futuros, crédito e a comparação entre diferentes alternativas financeiras.',
      source: selic.source,
      referenceDate: selic.date
    });
  }

  if (ipca) {
    observations.push({
      id: 'ipca-context',
      topic: 'inflacao',
      title: 'Contexto de inflação',
      summary: `O IPCA mensal de referência disponível é ${ipca.value.toFixed(2).replace('.', ',')}%.`,
      explanation: 'Inflação pode afetar poder de compra, custos, margens e expectativas de juros. O efeito varia conforme setor, empresa, produto e horizonte.',
      source: ipca.source,
      referenceDate: ipca.date
    });
  }

  if (usd) {
    observations.push({
      id: 'usd-context',
      topic: 'cambio',
      title: 'Contexto cambial',
      summary: `A referência disponível para dólar comercial é R$ ${usd.value.toFixed(2).replace('.', ',')}.`,
      explanation: 'Variações cambiais podem afetar receitas, custos, inflação e endividamento de forma diferente conforme a exposição de cada negócio ou ativo.',
      source: usd.source,
      referenceDate: usd.date
    });
  }

  return observations;
}

async function refreshMacroData() {
  const results = await Promise.allSettled([
    fetchBcbLastValue('selicTarget'),
    fetchBcbLastValue('ipcaMonthly'),
    fetchBcbLastValue('usdBrl')
  ]);
  const [selicResult, ipcaResult, usdResult] = results;

  const indicators = [
    indicatorFromResult(
      'selic',
      selicResult,
      'Principal referência para custo do dinheiro, crédito, taxa de desconto e comparação entre fluxos financeiros.',
      classifySelic
    ),
    indicatorFromResult(
      'ipca',
      ipcaResult,
      'Mede inflação ao consumidor e ajuda a contextualizar poder de compra, custos e expectativas de juros.',
      classifyIpca
    ),
    indicatorFromResult(
      'usdbrl',
      usdResult,
      'Ajuda a contextualizar exposição cambial, custos dolarizados, receitas externas e inflação.',
      classifyUsd
    )
  ].filter(Boolean);

  const keys = ['selicTarget', 'ipcaMonthly', 'usdBrl'];
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [{ series: keys[index], error: String(result.reason?.message || 'provider unavailable') }]
    : []);

  macroCache = {
    updatedAt: indicators.length ? new Date().toISOString() : null,
    source: indicators.length ? 'banco-central-sgs-online' : 'unavailable',
    cacheTtlMinutes: CACHE_TTL_MS / 60000,
    indicators,
    observations: buildNeutralObservations(indicators),
    // Kept only as a compatibility field. Automated allocation/recommendation signals are intentionally disabled.
    signals: [],
    degraded: failures.length > 0,
    failures
  };
  lastRefreshAt = Date.now();
  return macroCache;
}

async function getMacroData({ force = false } = {}) {
  const isFresh = Date.now() - lastRefreshAt < CACHE_TTL_MS;
  if (!force && isFresh) return macroCache;

  if (!inFlightRefresh) {
    inFlightRefresh = refreshMacroData().finally(() => {
      inFlightRefresh = null;
    });
  }

  try {
    return await inFlightRefresh;
  } catch (error) {
    console.error('Macro refresh failed:', error.message);
    return {
      ...macroCache,
      degraded: true,
      failures: [...(macroCache.failures || []), { series: 'macro-refresh', error: String(error.message || 'refresh failed') }]
    };
  }
}

function getActiveSignals() {
  // Compatibility only: investment-allocation signals are intentionally disabled.
  return [];
}

setInterval(() => {
  refreshMacroData().catch((error) => {
    console.error('Macro scheduled refresh failed:', error.message);
  });
}, 6 * 60 * 60 * 1000);

refreshMacroData().catch((error) => {
  console.error('Initial macro refresh failed:', error.message);
});

module.exports = {
  refreshMacroData,
  getMacroData,
  getActiveSignals
};
