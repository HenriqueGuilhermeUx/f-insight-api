'use strict';

const express = require('express');
const router = express.Router();
const { requireInternalAccess } = require('../services/marketTerminal/internalAccess');
const { listAlphas, alphaMetadata } = require('../services/vibeResearchAdapter');

router.use(requireInternalAccess);

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'internal-read-only',
    execution: false,
    upstreamConfigured: Boolean(process.env.VIBE_RESEARCH_BASE_URL),
  });
});

router.get('/alphas', async (_req, res) => {
  try {
    const data = await listAlphas();
    return res.json({ ok: true, source: 'vibe-trading', researchOnly: true, data });
  } catch (_error) {
    return res.status(502).json({ ok: false, error: 'RESEARCH_UPSTREAM_UNAVAILABLE' });
  }
});

router.get('/alphas/:id', async (req, res) => {
  if (!/^[a-zA-Z0-9_.-]{1,90}$/.test(req.params.id)) {
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
