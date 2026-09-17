'use strict';

const marketTerminal = require('../src/services/marketTerminalEngine');
const sentiment = require('../src/services/marketTerminal/sentimentEngine');
const analytics = require('../src/services/marketTerminal/marketAnalytics');
const { parseOptionChainCsv } = require('../src/services/marketTerminal/optionChainCsv');
const quantLab = require('../src/services/quantLabEngine');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

function buildSyntheticHistory() {
  const rows = [];
  let price = 40;
  for (let i = 0; i < 180; i += 1) {
    const deterministicMove = Math.sin(i / 7) * 0.009 + Math.cos(i / 17) * 0.004 + 0.0005;
    price *= (1 + deterministicMove);
    rows.push({ date: `D${i + 1}`, close: price });
  }
  return { rows };
}

async function main() {
  const syntheticSentiment = sentiment.aggregateSentiment({
    news: [{ score: 0.35 }, { score: 0.10 }, { score: -0.05 }],
    reddit: [{ score: 0.40 }, { score: 0.20 }],
    x: [{ score: 0.15 }, { score: -0.10 }],
    prediction: [{ score: 0.05 }],
  });

  const historyAnalytics = analytics.summarizeHistory(buildSyntheticHistory());
  assert(historyAnalytics.observations === 180, 'historical observation count');
  assert(historyAnalytics.volatility.hv60 > 0, 'HV60 should be positive');

  const csv = [
    'ticker;ativo;tipo;strike;premio;bid;ask;volume;open_interest;dias_ate_vencimento',
    'PETR4C450;PETR4;call;45;1,20;1,10;1,30;18000;120000;90',
    'PETR4P380;PETR4;put;38;0,75;0,70;0,82;6000;42000;90',
  ].join('\n');
  const parsed = parseOptionChainCsv(csv);
  assert(parsed.rows.length === 2, 'CSV option chain should parse two rows');

  const scan = quantLab.runManualScan({
    symbol: 'PETR4',
    spot: 42.10,
    daysToExpiry: 90,
    riskFreeRate: 0.12,
    annualVolatility: historyAnalytics.volatility.hv60,
    annualDrift: historyAnalytics.annualizedDrift,
    simulations: 5000,
    options: parsed.rows,
  });
  assert(scan.count === 2, 'quant scan should analyze two options');
  assert(scan.top.every((item) => Number.isFinite(item.score)), 'quant scores should be finite');

  const output = {
    ok: true,
    architecture: marketTerminal.architecturePlan(),
    providers: marketTerminal.providerStatus(),
    tradingViewPlan: marketTerminal.buildTradingViewWidgetPlan('PETR4'),
    syntheticSentiment,
    historyAnalytics,
    csvImport: { count: parsed.count, errors: parsed.errors },
    quantScan: scan.top.map((item) => ({
      symbol: item.symbol,
      score: item.score,
      label: item.label,
      edgePct: Number((item.edge * 100).toFixed(2)),
    })),
    notice: marketTerminal.INTERNAL_NOTICE,
  };

  if (process.argv.includes('--live')) {
    output.live = await marketTerminal.buildAssetResearchBundle(process.env.TEST_SYMBOL || 'PETR4.SA', {
      history: true,
      macro: true,
      externalSentiment: true,
      sentiment: { news: [{ score: 0.10 }] },
    });
    assert(output.live.history?.rows?.length > 20, 'live history should have observations');
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
