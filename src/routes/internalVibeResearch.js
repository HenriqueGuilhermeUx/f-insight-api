'use strict';

const express = require('express');
const router = express.Router();
const { requireInternalAccess } = require('../services/marketTerminal/internalAccess');
const { listAlphas, alphaMetadata, validateVibeListFilters } = require('../services/vibeResearchAdapter');

// This adapter never accepts the legacy non-production unauthenticated
// override used by other market-terminal endpoints. Fail closed everywhere.
router.use((req, res, next) => {
  if (!process.env.FINSIGHT_INTERNAL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'RESEARCH_AUTH_NOT_CONFIGURED' });
  }
  return requireInternalAccess(req, res, next);
});

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'internal-read-only',
    execution: false,
    upstreamConfigured: Boolean(process.env.VIBE_RESEARCH_BASE_URL),
  });
});

router.get('/alphas', async (req, res) => {
  let filters;
  try {
    filters = validateVibeListFilters(req.query || {});
  } catch {
    return res.status(400).json({ ok: false, error: 'INVALID_RESEARCH_FILTERS' });
  }
  try {
    const data = await listAlphas({ filters });
    return res.json({ ok: true, source: 'vibe-trading', researchOnly: true, data });
  } catch (_error) {
    return res.status(502).json({ ok: false, error: 'RESEARCH_UPSTREAM_UNAVAILABLE' });
  }
});

router.get('/alphas/:id', async (req, res) => {
  if (!/^[a-z][a-z0-9]+_[a-z0-9_]{1,64}$/.test(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ALPHA_ID' });
  }
  try {
    const data = await alphaMetadata(req.params.id);
    return res.json({ ok: true, source: 'vibe-trading', researchOnly: true, data });
  } catch (_error) {
    return res.status(502).json({ ok: false, error: 'RESEARCH_UPSTREAM_UNAVAILABLE' });
  }
});

module.exports = router;
