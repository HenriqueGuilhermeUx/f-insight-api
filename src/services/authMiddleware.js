'use strict';

const { dataSupabase, isDataSupabaseEnabled } = require('./dataSupabaseClient');

function extractBearerToken(req) {
  const header = String(req.get('authorization') || '').trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeRole(user) {
  const role = user?.app_metadata?.role;
  if (role === 'advisor') return 'advisor';
  if (role === 'admin' || role === 'tenant_admin' || role === 'platform_admin') return 'admin';
  return 'client';
}

function normalizeTenantId(user) {
  const tenantId = user?.app_metadata?.tenant_id;
  return tenantId ? String(tenantId) : null;
}

async function requireAuthenticatedUser(req, res, next) {
  if (!isDataSupabaseEnabled() || !dataSupabase) {
    return res.status(503).json({ ok: false, error: 'AUTH_BACKEND_UNAVAILABLE' });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  }

  try {
    const { data, error } = await dataSupabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: 'INVALID_SESSION' });
    }

    req.authUser = {
      id: data.user.id,
      email: data.user.email || null,
      role: normalizeRole(data.user),
      tenantId: normalizeTenantId(data.user),
    };
    return next();
  } catch (error) {
    console.warn('Authentication lookup failed:', error.message);
    return res.status(401).json({ ok: false, error: 'INVALID_SESSION' });
  }
}

function requireRoles(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    return next();
  };
}

module.exports = {
  extractBearerToken,
  normalizeRole,
  normalizeTenantId,
  requireAuthenticatedUser,
  requireRoles,
};
