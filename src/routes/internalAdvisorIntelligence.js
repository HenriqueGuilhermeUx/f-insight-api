'use strict';

const express = require('express');
const router = express.Router();
const advisor = require('../services/advisorIntelligenceEngine');
const { requireInternalAccess } = require('../services/marketTerminal/internalAccess');

router.use(requireInternalAccess);

router.get('/health', function (_req, res) {
  res.json({ ok: true, service: 'finsight-advisor-intelligence-internal', mode: 'internal-only', notice: advisor.NOTICE });
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

router.post('/book/impact', function (req, res) {
  try {
    res.json(advisor.analyzeAdvisorBook(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'ADVISOR_BOOK_ANALYSIS_FAILED', message: error.message });
  }
});

module.exports = router;
