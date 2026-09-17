'use strict';

const axios = require('axios');

const COMPANY_REGISTRY_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv';
const IPE_BASE_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS';

let cache = { fetchedAt: 0, rows: [] };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function splitSemicolonCsvLine(line = '') {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      out.push(current); current = '';
    } else current += char;
  }
  out.push(current);
  return out.map((item) => item.trim());
}

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function decodeBuffer(buffer) {
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch (_error) {
    return Buffer.from(buffer).toString('latin1');
  }
}

function parseCompanyRegistry(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitSemicolonCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitSemicolonCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

async function getCompanyRegistry(options = {}) {
  const now = Date.now();
  if (!options.force && cache.rows.length && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { source: 'CVM Dados Abertos', fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true, rows: cache.rows };
  }
  const response = await axios.get(COMPANY_REGISTRY_URL, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': 'F-Insight-Research/1.0' },
  });
  const rows = parseCompanyRegistry(decodeBuffer(response.data));
  cache = { fetchedAt: now, rows };
  return { source: 'CVM Dados Abertos', fetchedAt: new Date(now).toISOString(), cached: false, rows };
}

async function searchCompanies(query, options = {}) {
  const clean = normalizeText(query);
  if (!clean) return [];
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50);
  const registry = await getCompanyRegistry(options);
  return registry.rows.filter((row) => {
    const haystack = normalizeText([
      row.DENOM_SOCIAL,
      row.DENOM_COMERC,
      row.CNPJ_CIA,
      row.CD_CVM,
      row.SETOR_ATIV,
    ].filter(Boolean).join(' '));
    return haystack.includes(clean);
  }).slice(0, limit).map((row) => ({
    cvmCode: row.CD_CVM || null,
    cnpj: row.CNPJ_CIA || null,
    legalName: row.DENOM_SOCIAL || null,
    tradeName: row.DENOM_COMERC || null,
    sector: row.SETOR_ATIV || null,
    status: row.SIT || null,
    registrationDate: row.DT_REG || null,
    website: row.PAGINA_WEB || null,
  }));
}

function getIpeDatasetUrl(year = new Date().getFullYear()) {
  const cleanYear = Math.min(Math.max(Number(year), 2003), new Date().getFullYear());
  return `${IPE_BASE_URL}/ipe_cia_aberta_${cleanYear}.zip`;
}

function sourceCatalog() {
  return {
    companyRegistry: COMPANY_REGISTRY_URL,
    ipeCurrentYear: getIpeDatasetUrl(),
    note: 'O cadastro de companhias e publico. O conjunto IPE e disponibilizado pela CVM em ZIP anual e sera processado por pipeline dedicado antes de entrar no produto.',
  };
}

module.exports = {
  COMPANY_REGISTRY_URL,
  getCompanyRegistry,
  searchCompanies,
  getIpeDatasetUrl,
  sourceCatalog,
  parseCompanyRegistry,
};
