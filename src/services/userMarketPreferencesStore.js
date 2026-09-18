'use strict';

const { dataSupabase: supabase, isDataSupabaseEnabled: isSupabaseEnabled, dataSupabaseMode } = require('./dataSupabaseClient');

const WATCHLIST_TABLE = 'finsight_watchlist_items';
const ALERTS_TABLE = 'finsight_price_alerts';

const memoryWatchlists = new Map();
const memoryAlerts = new Map();

function cleanUserId(value) {
  const userId = String(value || '').trim();
  if (!userId) {
    const error = new Error('User ID is required');
    error.code = 'USER_ID_REQUIRED';
    throw error;
  }
  return userId.slice(0, 240);
}

function cleanTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  if (!ticker) {
    const error = new Error('Ticker is required');
    error.code = 'TICKER_REQUIRED';
    throw error;
  }
  return ticker.slice(0, 40);
}

function toWatchlistItem(row) {
  return {
    ticker: row.ticker,
    name: row.name || row.ticker,
    type: row.type || 'stock',
    addedAt: row.created_at || row.addedAt || new Date().toISOString(),
  };
}

function toAlert(row) {
  return {
    id: String(row.id),
    ticker: row.ticker,
    type: row.type,
    value: Number(row.value),
    enabled: row.enabled !== false,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    triggeredAt: row.triggered_at || row.triggeredAt || null,
  };
}

function warnFallback(scope, error) {
  const message = error && error.message ? error.message : String(error || 'unknown error');
  console.warn(`[preferences-store] ${scope}: Supabase unavailable, using memory fallback: ${message}`);
}

async function getWatchlist(userIdInput) {
  const userId = cleanUserId(userIdInput);

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase
        .from(WATCHLIST_TABLE)
        .select('ticker,name,type,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map(toWatchlistItem);
    } catch (error) {
      warnFallback('getWatchlist', error);
    }
  }

  return [...(memoryWatchlists.get(userId) || [])];
}

async function addWatchlistItem(userIdInput, payload = {}) {
  const userId = cleanUserId(userIdInput);
  const ticker = cleanTicker(payload.ticker);
  const name = String(payload.name || ticker).trim().slice(0, 160) || ticker;
  const type = String(payload.type || 'stock').trim().slice(0, 40) || 'stock';

  if (isSupabaseEnabled()) {
    try {
      const { data: existing, error: existingError } = await supabase
        .from(WATCHLIST_TABLE)
        .select('id')
        .eq('user_id', userId)
        .eq('ticker', ticker)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length) {
        const duplicate = new Error('Asset already in watchlist');
        duplicate.code = 'WATCHLIST_DUPLICATE';
        throw duplicate;
      }

      const { error: insertError } = await supabase.from(WATCHLIST_TABLE).insert({
        user_id: userId,
        ticker,
        name,
        type,
      });
      if (insertError) throw insertError;
      return getWatchlist(userId);
    } catch (error) {
      if (error.code === 'WATCHLIST_DUPLICATE') throw error;
      warnFallback('addWatchlistItem', error);
    }
  }

  const current = memoryWatchlists.get(userId) || [];
  if (current.some((item) => item.ticker === ticker)) {
    const duplicate = new Error('Asset already in watchlist');
    duplicate.code = 'WATCHLIST_DUPLICATE';
    throw duplicate;
  }

  current.push({ ticker, name, type, addedAt: new Date().toISOString() });
  memoryWatchlists.set(userId, current);
  return [...current];
}

async function removeWatchlistItem(userIdInput, tickerInput) {
  const userId = cleanUserId(userIdInput);
  const ticker = cleanTicker(tickerInput);

  if (isSupabaseEnabled()) {
    try {
      const { error } = await supabase
        .from(WATCHLIST_TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('ticker', ticker);
      if (error) throw error;
      return getWatchlist(userId);
    } catch (error) {
      warnFallback('removeWatchlistItem', error);
    }
  }

  const current = memoryWatchlists.get(userId) || [];
  const next = current.filter((item) => item.ticker !== ticker);
  memoryWatchlists.set(userId, next);
  return [...next];
}

async function getAlerts(userIdInput) {
  const userId = cleanUserId(userIdInput);

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase
        .from(ALERTS_TABLE)
        .select('id,ticker,type,value,enabled,created_at,triggered_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(toAlert);
    } catch (error) {
      warnFallback('getAlerts', error);
    }
  }

  return [...(memoryAlerts.get(userId) || [])];
}

async function createAlert(payload = {}) {
  const userId = cleanUserId(payload.userId);
  const ticker = cleanTicker(payload.ticker);
  const type = String(payload.type || '').trim().slice(0, 40);
  const value = Number(payload.value);
  const enabled = payload.enabled !== false;

  if (!type || !Number.isFinite(value)) {
    const error = new Error('Missing required fields');
    error.code = 'ALERT_FIELDS_REQUIRED';
    throw error;
  }

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase
        .from(ALERTS_TABLE)
        .insert({ user_id: userId, ticker, type, value, enabled })
        .select('id,ticker,type,value,enabled,created_at,triggered_at')
        .single();
      if (error) throw error;
      return toAlert(data);
    } catch (error) {
      warnFallback('createAlert', error);
    }
  }

  const current = memoryAlerts.get(userId) || [];
  const alert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker,
    type,
    value,
    enabled,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
  };
  current.unshift(alert);
  memoryAlerts.set(userId, current);
  return { ...alert };
}

async function updateAlert(alertIdInput, changes = {}) {
  const alertId = String(alertIdInput || '').trim();
  if (!alertId) return null;

  const patch = {};
  if (changes.enabled !== undefined) patch.enabled = Boolean(changes.enabled);
  if (changes.value !== undefined) {
    const value = Number(changes.value);
    if (!Number.isFinite(value)) {
      const error = new Error('Invalid alert value');
      error.code = 'INVALID_ALERT_VALUE';
      throw error;
    }
    patch.value = value;
  }

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase
        .from(ALERTS_TABLE)
        .update(patch)
        .eq('id', alertId)
        .select('id,ticker,type,value,enabled,created_at,triggered_at')
        .maybeSingle();
      if (error) throw error;
      if (data) return toAlert(data);
      return null;
    } catch (error) {
      warnFallback('updateAlert', error);
    }
  }

  for (const [userId, alerts] of memoryAlerts.entries()) {
    const index = alerts.findIndex((alert) => alert.id === alertId);
    if (index !== -1) {
      alerts[index] = { ...alerts[index], ...patch };
      memoryAlerts.set(userId, alerts);
      return { ...alerts[index] };
    }
  }
  return null;
}

async function deleteAlert(alertIdInput) {
  const alertId = String(alertIdInput || '').trim();
  if (!alertId) return false;

  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase
        .from(ALERTS_TABLE)
        .delete()
        .eq('id', alertId)
        .select('id');
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    } catch (error) {
      warnFallback('deleteAlert', error);
    }
  }

  for (const [userId, alerts] of memoryAlerts.entries()) {
    const next = alerts.filter((alert) => alert.id !== alertId);
    if (next.length !== alerts.length) {
      memoryAlerts.set(userId, next);
      return true;
    }
  }
  return false;
}

function storageMode() {
  return isSupabaseEnabled() ? `${dataSupabaseMode()}-with-memory-fallback` : 'memory-fallback';
}

function resetMemoryForTests() {
  memoryWatchlists.clear();
  memoryAlerts.clear();
}

module.exports = {
  WATCHLIST_TABLE,
  ALERTS_TABLE,
  getWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  storageMode,
  resetMemoryForTests,
};
