const { createClient } = require('@supabase/supabase-js');

const hasDedicatedPair = Boolean(
  process.env.FINSIGHT_DATA_SUPABASE_URL &&
  process.env.FINSIGHT_DATA_SUPABASE_SERVICE_ROLE_KEY
);

const DATA_SUPABASE_URL = hasDedicatedPair
  ? process.env.FINSIGHT_DATA_SUPABASE_URL
  : process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

const DATA_SUPABASE_SERVICE_ROLE_KEY = hasDedicatedPair
  ? process.env.FINSIGHT_DATA_SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let dataSupabase = null;

if (DATA_SUPABASE_URL && DATA_SUPABASE_SERVICE_ROLE_KEY) {
  dataSupabase = createClient(DATA_SUPABASE_URL, DATA_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  console.warn(
    'F-Insight data persistence disabled: set FINSIGHT_DATA_SUPABASE_URL and FINSIGHT_DATA_SUPABASE_SERVICE_ROLE_KEY.'
  );
}

function isDataSupabaseEnabled() {
  return Boolean(dataSupabase);
}

function dataSupabaseMode() {
  if (hasDedicatedPair) {
    return 'dedicated-data-supabase';
  }
  if (dataSupabase) return 'legacy-supabase-env';
  return 'memory-fallback';
}

module.exports = {
  dataSupabase,
  isDataSupabaseEnabled,
  dataSupabaseMode,
};
