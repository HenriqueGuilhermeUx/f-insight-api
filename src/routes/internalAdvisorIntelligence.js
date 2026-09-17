'use strict';

const express = require('express');
const router = express.Router();
const advisor = require('../services/advisorIntelligenceEngine');
const enrichment = require('../services/advisorMarketEnrichment');
const { requireInternalAccess } = require('../services/marketTerminal/internalAccess');

router.use(requireInternalAccess);

router.get('/health', function (_req, res) {
  res.json({ ok: true, service: 'finsight-advisor-intelligence-internal', mode: 'internal-only', marketEnrichment: true, notice: advisor.NOTICE });
});

router.get('/scenarios', function (_req, res) {
  res.json({ ok: true, scenarios: advisor.scenarioLibrary(), notice: advisor.NOTICE });
});

router.post('/portfolio/analyze', function (req, res) {
  try {
    res.json(advisor.analyzePortfolio(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'PORTFOLIO_ANALYSIS_FAILED', message: error.message });
  }
});

router.post('/portfolio/stress', function (req, res) {
  try {
    res.json(advisor.stressPortfolio(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'PORTFOLIO_STRESS_FAILED', message: error.message });
  }
});

router.post('/portfolio/live-analyze', async function (req, res) {
  try {
    res.json(await enrichment.enrichPortfolio(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'LIVE_PORTFOLIO_ANALYSIS_FAILED', message: error.message });
  }
});

router.post('/portfolio/live-stress', async function (req, res) {
  try {
    res.json(await enrichment.enrichAndStressPortfolio(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'LIVE_PORTFOLIO_STRESS_FAILED', message: error.message });
  }
});

router.post('/book/impact', function (req, res) {
  try {
    res.json(advisor.analyzeAdvisorBook(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'ADVISOR_BOOK_ANALYSIS_FAILED', message: error.message });
  }
});

router.post('/book/live-impact', async function (req, res) {
  try {
    res.json(await enrichment.enrichAdvisorBook(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'LIVE_ADVISOR_BOOK_ANALYSIS_FAILED', message: error.message });
  }
});

module.exports = router;
