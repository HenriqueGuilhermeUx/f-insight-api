'use strict';

const marketTerminal = require('../src/services/marketTerminalEngine');
const sentiment = require('../src/services/marketTerminal/sentimentEngine');

async function main() {
  const syntheticSentiment = sentiment.aggregateSentiment({
    news: [{ score: 0.35 }, { score: 0.10 }, { score: -0.05 }],
    reddit: [{ score: 0.40 }, { score: 0.20 }],
    x: [{ score: 0.15 }, { score: -0.10 }],
    prediction: [{ score: 0.05 }],
  });

  const output = {
    ok: true,
    architecture: marketTerminal.architecturePlan(),
    providers: marketTerminal.providerStatus(),
    tradingViewPlan: marketTerminal.buildTradingViewWidgetPlan('PETR4'),
    syntheticSentiment,
    notice: marketTerminal.INTERNAL_NOTICE,
  };

  if (process.argv.includes('--live')) {
    output.live = await marketTerminal.buildAssetResearchBundle(process.env.TEST_SYMBOL || 'AAPL', {
      history: Boolean(process.env.OPENBB_BASE_URL),
      externalSentiment: true,
      sentiment: {
        news: [{ score: 0.10 }],
      },
    });
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
