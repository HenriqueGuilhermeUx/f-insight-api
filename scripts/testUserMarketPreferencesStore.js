'use strict';

const store = require('../src/services/userMarketPreferencesStore');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  store.resetMemoryForTests();

  const userId = 'ci-user@example.com';
  let watchlist = await store.getWatchlist(userId);
  assert(Array.isArray(watchlist) && watchlist.length === 0, 'watchlist should start empty');

  watchlist = await store.addWatchlistItem(userId, { ticker: 'petr4', name: 'Petrobras', type: 'stock' });
  assert(watchlist.length === 1, 'watchlist should have one item');
  assert(watchlist[0].ticker === 'PETR4', 'ticker should normalize to uppercase');

  let duplicateCaught = false;
  try {
    await store.addWatchlistItem(userId, { ticker: 'PETR4' });
  } catch (error) {
    duplicateCaught = error.code === 'WATCHLIST_DUPLICATE';
  }
  assert(duplicateCaught, 'duplicate watchlist item should be rejected');

  watchlist = await store.removeWatchlistItem(userId, 'PETR4');
  assert(watchlist.length === 0, 'watchlist item should be removed');

  const alert = await store.createAlert({
    userId,
    ticker: 'VALE3',
    type: 'price_below',
    value: 55.25,
  });
  assert(alert.ticker === 'VALE3', 'alert ticker should be stored');
  assert(alert.enabled === true, 'alert should default to enabled');

  const alerts = await store.getAlerts(userId);
  assert(alerts.length === 1, 'one alert should exist');

  const updated = await store.updateAlert(alert.id, { enabled: false, value: 54.5 });
  assert(updated && updated.enabled === false, 'alert should disable');
  assert(updated.value === 54.5, 'alert value should update');

  const deleted = await store.deleteAlert(alert.id);
  assert(deleted === true, 'alert should delete');
  assert((await store.getAlerts(userId)).length === 0, 'alerts should be empty after delete');

  console.log(JSON.stringify({
    ok: true,
    storageMode: store.storageMode(),
    watchlistCompatibility: true,
    alertsCompatibility: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
