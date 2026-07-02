const axios = require('axios');

const BCB_SERIES = {
  selicTarget: { code: 432, label: 'Selic Meta', unit: '% a.a.' },
  ipcaMonthly: { code: 433, label: 'IPCA Mensal', unit: '% m/m' },
  usdBrl: { code: 1, label: 'Dólar Comercial', unit: 'BRL' }
};

const fallbackMacro = {
  updatedAt: new Date().toISOString(),
  source: 'fallback',
  indicators: [
    {
      id: 'selic',
      label: 'Selic Meta',
      value: 10.5,
      unit: '% a.a.',
      date: new Date().toISOString().slice(0, 10),
      trend: 'neutral',
      interpretation: 'Juros ainda em patamar relevante para valuation e renda fixa.'
    },
    {
      id: 'ipca',
      label: 'IPCA Mensal',
      value: 0.38,
      unit: '% m/m',
      date: new Date().toISOString().slice(0, 10),
      trend: 'neutral',
      interpretation: 'Inflação em observação; impacto direto na curva de juros.'
    },
    {
      id: 'usdbrl',
      label: 'Dólar Comercial',
      value: 5.2,
      unit: 'BRL',
      date: new Date().toISOString().slice(0, 10),
      trend: 'neutral',
      interpretation: 'Câmbio influencia commodities, empresas exportadoras e inflação.'
    }
  ],
  signals: []
};

let macroCache = {
  ...fallbackMacro,
  signals: buildSignals(fallbackMacro.indicators)
};

function parseBcbValue(raw) {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchBcbLastValue(seriesKey) {
  const series = BCB_SERIES[seriesKey];
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series.code}/dados/ultimos/1?formato=json`;
  const response = await axios.get(url, { timeout: 10000 });
  const item = Array.isArray(response.data) ? response.data[0] : null;

  if (!item) {
    throw new Error(`BCB series ${series.code} returned no data`);
  }

  const value = parseBcbValue(item.valor);
  if (value === null) {
    throw new Error(`BCB series ${series.code} returned invalid value`);
  }

  return {
    value,
    date: item.data,
    label: series.label,
    unit: series.unit
  };
}

function getIndicator(indicators, id) {
  return indicators.find((indicator) => indicator.id === id);
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

function buildSignals(indicators) {
  const selic = getIndicator(indicators, 'selic');
  const ipca = getIndicator(indicators, 'ipca');
  const usd = getIndicator(indicators, 'usdbrl');
  const now = new Date().toISOString();
  const signals = [];

  if (selic?.value >= 10) {
    signals.push({
      id: 'selic-value-defensivo',
      title: 'Juros altos favorecem qualidade, dividendos e margem de segurança',
      type: 'macro_value',
      impact: 'moderado',
      status: 'ativo',
      tickers: ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'TAEE4'],
      summary: 'Com a Selic em patamar elevado, ativos com geração de caixa, dividendos e valuation descontado ganham prioridade no radar.',
      rationale: 'Juros altos elevam a taxa de desconto dos fluxos futuros. Empresas lucrativas, com caixa e múltiplos menores tendem a sofrer menos compressão de valuation.',
      suggestedAction: 'Priorizar relatórios de Graham Score, dividend yield e margem de segurança antes de aumentar exposição a crescimento.',
      generatedAt: now
    });
  }

  if (ipca?.value >= 0.5) {
    signals.push({
      id: 'ipca-protecao-inflacao',
      title: 'Inflação pressionada: revisar empresas com poder de repasse',
      type: 'inflation_risk',
      impact: 'alto',
      status: 'ativo',
      tickers: ['ABEV3', 'WEGE3', 'EQTL3', 'PETR4'],
      summary: 'Inflação mensal acima do conforto exige atenção a empresas com capacidade de repassar preços e proteger margens.',
      rationale: 'Inflação persistente pode pressionar custos e reduzir margem de empresas sem poder de preço.',
      suggestedAction: 'Gerar relatórios para setores regulados, exportadoras e empresas com margem operacional resiliente.',
      generatedAt: now
    });
  }

  if (usd?.value >= 5.3) {
    signals.push({
      id: 'dolar-exportadoras',
      title: 'Câmbio elevado aumenta atratividade relativa de exportadoras',
      type: 'fx_tailwind',
      impact: 'moderado',
      status: 'ativo',
      tickers: ['VALE3', 'PETR4', 'SUZB3', 'JBSS3'],
      summary: 'Dólar mais forte tende a beneficiar empresas com receita dolarizada, embora também pressione custos e inflação.',
      rationale: 'Receitas em dólar podem elevar geração de caixa em reais para companhias exportadoras.',
      suggestedAction: 'Comparar exposição cambial, dívida em dólar e margem de segurança antes da recomendação.',
      generatedAt: now
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: 'macro-neutro',
      title: 'Cenário macro neutro: manter disciplina de valuation',
      type: 'neutral_watch',
      impact: 'baixo',
      status: 'monitorando',
      tickers: ['PETR4', 'VALE3', 'ITUB4', 'WEGE3'],
      summary: 'Sem gatilho macro extremo no momento. O foco deve permanecer em valuation, qualidade e assimetria.',
      rationale: 'Quando juros, inflação e câmbio não geram sinal forte, a seleção bottom-up ganha peso na tomada de decisão.',
      suggestedAction: 'Usar Graham Score e DCF como filtros principais antes de emitir relatórios para clientes.',
      generatedAt: now
    });
  }

  return signals;
}

async function refreshMacroData() {
  const [selicResult, ipcaResult, usdResult] = await Promise.allSettled([
    fetchBcbLastValue('selicTarget'),
    fetchBcbLastValue('ipcaMonthly'),
    fetchBcbLastValue('usdBrl')
  ]);

  const fallbackIndicators = fallbackMacro.indicators;
  const selicData = selicResult.status === 'fulfilled' ? selicResult.value : null;
  const ipcaData = ipcaResult.status === 'fulfilled' ? ipcaResult.value : null;
  const usdData = usdResult.status === 'fulfilled' ? usdResult.value : null;

  const indicators = [
    {
      id: 'selic',
      label: 'Selic Meta',
      value: selicData?.value ?? getIndicator(fallbackIndicators, 'selic').value,
      unit: '% a.a.',
      date: selicData?.date ?? getIndicator(fallbackIndicators, 'selic').date,
      trend: classifySelic(selicData?.value ?? getIndicator(fallbackIndicators, 'selic').value),
      interpretation: 'Principal referência para taxa de desconto, renda fixa e múltiplos de ações.'
    },
    {
      id: 'ipca',
      label: 'IPCA Mensal',
      value: ipcaData?.value ?? getIndicator(fallbackIndicators, 'ipca').value,
      unit: '% m/m',
      date: ipcaData?.date ?? getIndicator(fallbackIndicators, 'ipca').date,
      trend: classifyIpca(ipcaData?.value ?? getIndicator(fallbackIndicators, 'ipca').value),
      interpretation: 'Inflação impacta juros futuros, margens corporativas e poder de compra.'
    },
    {
      id: 'usdbrl',
      label: 'Dólar Comercial',
      value: usdData?.value ?? getIndicator(fallbackIndicators, 'usdbrl').value,
      unit: 'BRL',
      date: usdData?.date ?? getIndicator(fallbackIndicators, 'usdbrl').date,
      trend: classifyUsd(usdData?.value ?? getIndicator(fallbackIndicators, 'usdbrl').value),
      interpretation: 'Câmbio afeta inflação, commodities, exportadoras e empresas com dívida em dólar.'
    }
  ];

  macroCache = {
    updatedAt: new Date().toISOString(),
    source: selicData || ipcaData || usdData ? 'banco-central-sgs' : 'fallback',
    indicators,
    signals: buildSignals(indicators)
  };

  return macroCache;
}

function getMacroData() {
  return macroCache;
}

function getActiveSignals() {
  return macroCache.signals;
}

setInterval(() => {
  refreshMacroData().catch((error) => {
    console.error('Macro refresh failed:', error.message);
  });
}, 6 * 60 * 60 * 1000);

module.exports = {
  refreshMacroData,
  getMacroData,
  getActiveSignals
};
