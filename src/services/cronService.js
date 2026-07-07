const cron = require('node-cron');
const {
  DEFAULT_SYMBOLS,
  refreshIndicators,
  refreshMacroAndPersist,
  refreshNews,
} = require('./liveDataService');

let started = false;

async function runInitialRefresh() {
  await Promise.allSettled([
    refreshNews(),
    refreshIndicators(DEFAULT_SYMBOLS),
    refreshMacroAndPersist(),
  ]);
}

function startCronJobs() {
  if (started) return;
  started = true;

  const enabled = process.env.ENABLE_CRON !== 'false';
  if (!enabled) {
    console.log('F-Insight cron disabled by ENABLE_CRON=false');
    return;
  }

  console.log('F-Insight cron enabled');

  // Notícias: a cada 30 minutos.
  cron.schedule('*/30 * * * *', () => {
    refreshNews().catch((error) => console.error('Cron news refresh failed:', error.message));
  });

  // Indicadores de mercado: de hora em hora.
  cron.schedule('5 * * * *', () => {
    refreshIndicators(DEFAULT_SYMBOLS).catch((error) => console.error('Cron indicators refresh failed:', error.message));
  });

  // Macro Banco Central: a cada 6 horas.
  cron.schedule('15 */6 * * *', () => {
    refreshMacroAndPersist().catch((error) => console.error('Cron macro refresh failed:', error.message));
  });

  runInitialRefresh().catch((error) => console.error('Initial live data refresh failed:', error.message));
}

module.exports = {
  startCronJobs,
  runInitialRefresh,
};
