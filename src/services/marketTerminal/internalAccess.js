'use strict';

const crypto = require('crypto');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function extractKey(req) {
  const header = req.get('x-finsight-internal-key');
  if (header) return header;
  const auth = req.get('authorization') || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return null;
}

function requireInternalAccess(req, res, next) {
  const expected = process.env.FINSIGHT_INTERNAL_API_KEY;
  const allowUnauthenticated = process.env.INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH === 'true' && process.env.NODE_ENV !== 'production';

  if (!expected) {
    if (allowUnauthenticated) return next();
    return res.status(503).json({ ok: false, error: 'INTERNAL_ACCESS_NOT_CONFIGURED' });
  }

  const supplied = extractKey(req);
  if (!supplied || !safeEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_INTERNAL_RESEARCH' });
  }

  return next();
}

module.exports = { requireInternalAccess, extractKey };
