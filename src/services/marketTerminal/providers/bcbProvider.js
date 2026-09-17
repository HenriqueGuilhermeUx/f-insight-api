'use strict';

const axios = require('axios');

const BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

const SERIES = {
  selicTarget: { code: 432, label: 'Selic meta', unit: '% a.a.' },
  usdBrl: { code: 1, label: 'Dólar comercial venda', unit: 'R$/US$' },
  ipcaMonthly: { code: 433, label: 'IPCA mensal', unit: '% a.m.' },
};

function normalizeNumber(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeObservation(item) {
  return {
    date: item?.data || null,
    value: normalizeNumber(item?.valor),
  };
}

async function getSeries(code, options = {}) {
  const last = Math.min(Math.max(Number(options.last || 10), 1), 120);
  const response = await axios.get(`${BASE_URL}.${encodeURIComponent(code)}/dados/ultimos/${last}`, {
    params: { formato: 'json' },
    timeout: 12000,
    headers: { 'User-Agent': 'F-Insight-Research/1.0' },
  });

  const data = Array.isArray(response.data) ? response.data.map(normalizeObservation) : [];
  return {
    source: 'Banco Central do Brasil - SGS',
    code: Number(code),
    fetchedAt: new Date().toISOString(),
    count: data.length,
    data,
    latest: data.length ? data[data.length - 1] : null,
  };
}

async function getMacroSnapshot() {
  const entries = Object.entries(SERIES);
  const settled = await Promise.allSettled(entries.map(([, meta]) => getSeries(meta.code, { last: 2 })));
  const snapshot = {};
  const errors = [];

  settled.forEach((result, index) => {
    const [key, meta] = entries[index];
    if (result.status === 'fulfilled') {
      snapshot[key] = {
        ...meta,
        ...result.value.latest,
        source: result.value.source,
      };
    } else {
      errors.push({ key, code: meta.code, message: result.reason?.message || String(result.reason) });
    }
  });

  return {
    ok: errors.length < entries.length,
    source: 'Banco Central do Brasil - SGS',
    fetchedAt: new Date().toISOString(),
    snapshot,
    errors,
  };
}

module.exports = {
  SERIES,
  getSeries,
  getMacroSnapshot,
};
