'use strict';

const HEADER_ALIASES = {
  symbol: ['symbol', 'ticker', 'codigo', 'código', 'option', 'opcao', 'opção'],
  underlying: ['underlying', 'ativo', 'ativo_objeto', 'ativo objeto', 'base'],
  type: ['type', 'tipo', 'call_put', 'call/put'],
  strike: ['strike', 'preco_exercicio', 'preço exercício', 'preco exercicio'],
  premium: ['premium', 'premio', 'prêmio', 'last', 'ultimo', 'último'],
  bid: ['bid', 'compra', 'melhor_compra', 'melhor compra'],
  ask: ['ask', 'venda', 'melhor_venda', 'melhor venda'],
  volume: ['volume', 'vol'],
  openInterest: ['openinterest', 'open_interest', 'oi', 'posicoes_abertas', 'posições abertas'],
  expiry: ['expiry', 'expiration', 'vencimento', 'data_vencimento'],
  daysToExpiry: ['daystoexpiry', 'days_to_expiry', 'dias_ate_vencimento', 'dias até vencimento'],
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function detectDelimiter(line = '') {
  const candidates = [';', ',', '\t'];
  return candidates.map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function splitCsvLine(line, delimiter) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current.trim()); current = '';
    } else current += char;
  }
  out.push(current.trim());
  return out;
}

function parseLocalizedNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  let text = String(value).trim().replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(text)) text = text.replace(',', '.');
  text = text.replace(/[^0-9.-]/g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function mapHeaders(headers = []) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};
  Object.entries(HEADER_ALIASES).forEach(([target, aliases]) => {
    const normalizedAliases = aliases.map(normalizeHeader);
    const index = normalized.findIndex((header) => normalizedAliases.includes(header));
    if (index >= 0) mapping[target] = index;
  });
  return mapping;
}

function normalizeType(value = '') {
  const text = String(value).trim().toLowerCase();
  if (['p', 'put', 'venda'].includes(text)) return 'put';
  return 'call';
}

function daysUntil(expiry) {
  if (!expiry) return null;
  const date = new Date(String(expiry).includes('/') ? String(expiry).split('/').reverse().join('-') : expiry);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function parseOptionChainCsv(text, defaults = {}) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['CSV precisa de cabecalho e pelo menos uma linha de dados.'] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const mapping = mapHeaders(headers);
  const required = ['symbol', 'strike'];
  const missing = required.filter((field) => mapping[field] === undefined);
  if (missing.length) return { rows: [], errors: [`Campos obrigatorios ausentes: ${missing.join(', ')}`], headers };

  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, rowIndex) => {
    const cells = splitCsvLine(line, delimiter);
    const read = (field) => mapping[field] === undefined ? undefined : cells[mapping[field]];
    const strike = parseLocalizedNumber(read('strike'));
    if (!strike) { errors.push(`Linha ${rowIndex + 2}: strike invalido.`); return; }
    const expiry = read('expiry') || defaults.expiry || null;
    const daysToExpiry = parseLocalizedNumber(read('daysToExpiry')) ?? daysUntil(expiry) ?? defaults.daysToExpiry ?? null;
    rows.push({
      symbol: read('symbol'),
      underlying: read('underlying') || defaults.underlying || null,
      type: normalizeType(read('type') || defaults.type),
      strike,
      premium: parseLocalizedNumber(read('premium')),
      bid: parseLocalizedNumber(read('bid')),
      ask: parseLocalizedNumber(read('ask')),
      volume: parseLocalizedNumber(read('volume')) || 0,
      openInterest: parseLocalizedNumber(read('openInterest')) || 0,
      expiry,
      daysToExpiry,
    });
  });

  return { rows, errors, headers, delimiter, count: rows.length };
}

module.exports = { parseOptionChainCsv, parseLocalizedNumber, normalizeHeader };
