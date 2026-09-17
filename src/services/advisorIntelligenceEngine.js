'use strict';

const NOTICE = 'Internal educational analytics. Outputs describe exposures and scenario effects; they are not investment recommendations.';

function n(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pct(value) {
  return Number((n(value) * 100).toFixed(2));
}

function normalizeHolding(holding = {}) {
  const quantity = Math.max(0, n(holding.quantity ?? holding.qty, 0));
  const price = Math.max(0, n(holding.price ?? holding.lastPrice, 0));
  const explicitValue = n(holding.marketValue, NaN);
  const marketValue = Number.isFinite(explicitValue) ? Math.max(0, explicitValue) : quantity * price;
  return {
    symbol: String(holding.symbol || holding.ticker || 'UNKNOWN').toUpperCase(),
    name: holding.name || holding.symbol || holding.ticker || 'Unknown asset',
    quantity,
    price,
    marketValue,
    assetClass: String(holding.assetClass || holding.type || 'other').toLowerCase(),
    sector: String(holding.sector || 'unknown').toLowerCase(),
    currency: String(holding.currency || 'BRL').toUpperCase(),
  };
}

function aggregateBy(holdings, field, total) {
  const grouped = new Map();
  holdings.forEach((holding) => {
    const key = holding[field] || 'unknown';
    grouped.set(key, (grouped.get(key) || 0) + holding.marketValue);
  });
  return [...grouped.entries()]
    .map(([key, marketValue]) => ({ key, marketValue, weight: total ? marketValue / total : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue);
}

function concentrationMetrics(weights = []) {
  const sorted = [...weights].sort((a, b) => b - a);
  const hhi = sorted.reduce((sum, weight) => sum + weight * weight, 0);
  const effectivePositions = hhi > 0 ? 1 / hhi : 0;
  return {
    hhi,
    effectivePositions,
    top1Weight: sorted[0] || 0,
    top3Weight: sorted.slice(0, 3).reduce((sum, weight) => sum + weight, 0),
    top5Weight: sorted.slice(0, 5).reduce((sum, weight) => sum + weight, 0),
  };
}

function concentrationLabel(metrics) {
  if (metrics.top1Weight >= 0.5 || metrics.hhi >= 0.35) return 'muito concentrada';
  if (metrics.top1Weight >= 0.3 || metrics.hhi >= 0.22) return 'concentrada';
  if (metrics.hhi >= 0.12) return 'moderada';
  return 'dispersa';
}

function analyzePortfolio(payload = {}) {
  const holdings = (Array.isArray(payload.holdings) ? payload.holdings : []).map(normalizeHolding).filter((item) => item.marketValue > 0);
  const totalMarketValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const positions = holdings
    .map((holding) => ({ ...holding, weight: totalMarketValue ? holding.marketValue / totalMarketValue : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue);
  const concentration = concentrationMetrics(positions.map((item) => item.weight));
  const byAssetClass = aggregateBy(positions, 'assetClass', totalMarketValue);
  const bySector = aggregateBy(positions, 'sector', totalMarketValue);
  const byCurrency = aggregateBy(positions, 'currency', totalMarketValue);
  const concentrationLevel = concentrationLabel(concentration);

  const observations = [];
  if (concentration.top1Weight >= 0.3) observations.push(`A maior posição representa ${pct(concentration.top1Weight)}% do patrimônio informado.`);
  if (concentration.top3Weight >= 0.65) observations.push(`As três maiores posições concentram ${pct(concentration.top3Weight)}% do patrimônio informado.`);
  if (byCurrency.length === 1) observations.push(`A carteira informada está integralmente denominada em ${byCurrency[0].key}.`);
  if (bySector[0]?.weight >= 0.4) observations.push(`O setor ${bySector[0].key} concentra ${pct(bySector[0].weight)}% do patrimônio informado.`);
  if (!observations.length) observations.push('Nenhuma concentração simples ultrapassou os gatilhos descritivos deste diagnóstico.');

  return {
    ok: true,
    portfolioId: payload.portfolioId || null,
    clientId: payload.clientId || null,
    generatedAt: new Date().toISOString(),
    totalMarketValue,
    positionCount: positions.length,
    positions,
    allocation: { byAssetClass, bySector, byCurrency },
    concentration: { ...concentration, label: concentrationLevel },
    observations,
    notice: NOTICE,
  };
}

function resolveShock(holding, scenario = {}) {
  const symbolShocks = scenario.symbolShocks || {};
  const sectorShocks = scenario.sectorShocks || {};
  const assetClassShocks = scenario.assetClassShocks || {};
  const currencyShocks = scenario.currencyShocks || {};
  const symbolShock = n(symbolShocks[holding.symbol], 0);
  const sectorShock = n(sectorShocks[holding.sector], 0);
  const assetClassShock = n(assetClassShocks[holding.assetClass], 0);
  const currencyShock = n(currencyShocks[holding.currency], 0);
  return symbolShock + sectorShock + assetClassShock + currencyShock + n(scenario.globalShock, 0);
}

function stressPortfolio(payload = {}) {
  const analysis = analyzePortfolio(payload);
  const scenario = payload.scenario || {};
  const positions = analysis.positions.map((holding) => {
    const shock = resolveShock(holding, scenario);
    const stressedValue = Math.max(0, holding.marketValue * (1 + shock));
    return {
      symbol: holding.symbol,
      marketValue: holding.marketValue,
      shock,
      stressedValue,
      pnl: stressedValue - holding.marketValue,
    };
  });
  const stressedValue = positions.reduce((sum, item) => sum + item.stressedValue, 0);
  const pnl = stressedValue - analysis.totalMarketValue;
  const pnlPct = analysis.totalMarketValue ? pnl / analysis.totalMarketValue : 0;

  return {
    ok: true,
    scenario: {
      name: scenario.name || 'custom scenario',
      description: scenario.description || null,
      globalShock: n(scenario.globalShock, 0),
      symbolShocks: scenario.symbolShocks || {},
      sectorShocks: scenario.sectorShocks || {},
      assetClassShocks: scenario.assetClassShocks || {},
      currencyShocks: scenario.currencyShocks || {},
    },
    baseValue: analysis.totalMarketValue,
    stressedValue,
    pnl,
    pnlPct,
    positions: positions.sort((a, b) => a.pnl - b.pnl),
    largestNegativeContributors: positions.filter((item) => item.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5),
    notice: NOTICE,
  };
}

function analyzeAdvisorBook(payload = {}) {
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const scenario = payload.scenario || {};
  const results = clients.map((client) => {
    const stressed = stressPortfolio({
      portfolioId: client.portfolioId,
      clientId: client.clientId || client.id,
      holdings: client.holdings || [],
      scenario,
    });
    const baseAnalysis = analyzePortfolio({ clientId: client.clientId || client.id, holdings: client.holdings || [] });
    return {
      clientId: client.clientId || client.id || null,
      clientName: client.clientName || client.name || null,
      baseValue: stressed.baseValue,
      stressedValue: stressed.stressedValue,
      scenarioPnl: stressed.pnl,
      scenarioPnlPct: stressed.pnlPct,
      concentrationLabel: baseAnalysis.concentration.label,
      topPosition: baseAnalysis.positions[0] ? {
        symbol: baseAnalysis.positions[0].symbol,
        weight: baseAnalysis.positions[0].weight,
      } : null,
    };
  });

  const totalBase = results.reduce((sum, item) => sum + item.baseValue, 0);
  const totalStressed = results.reduce((sum, item) => sum + item.stressedValue, 0);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    clientCount: results.length,
    aggregate: {
      baseValue: totalBase,
      stressedValue: totalStressed,
      pnl: totalStressed - totalBase,
      pnlPct: totalBase ? (totalStressed - totalBase) / totalBase : 0,
    },
    clients: results.sort((a, b) => a.scenarioPnlPct - b.scenarioPnlPct),
    affectedClients: results.filter((item) => Math.abs(item.scenarioPnlPct) >= Math.abs(n(payload.impactThreshold, 0.03))).length,
    notice: NOTICE,
  };
}

function scenarioLibrary() {
  return [
    {
      id: 'equity-down-10',
      name: 'Ações -10%',
      description: 'Choque educacional uniforme de -10% em posições classificadas como ações/equity.',
      assetClassShocks: { stock: -0.10, equity: -0.10, acao: -0.10, ações: -0.10 },
    },
    {
      id: 'br-risk-off',
      name: 'Brasil risk-off simplificado',
      description: 'Cenário hipotético simplificado para teste interno, não previsão.',
      assetClassShocks: { stock: -0.12, equity: -0.12, fii: -0.08, crypto: -0.18 },
      currencyShocks: { USD: 0.08 },
    },
    {
      id: 'crypto-down-20',
      name: 'Cripto -20%',
      description: 'Choque educacional uniforme de -20% em ativos classificados como crypto.',
      assetClassShocks: { crypto: -0.20 },
    },
  ];
}

module.exports = {
  NOTICE,
  normalizeHolding,
  analyzePortfolio,
  stressPortfolio,
  analyzeAdvisorBook,
  scenarioLibrary,
};
