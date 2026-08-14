const express = require('express');
const router = express.Router();
const service = require('../services/agentService');

router.get('/health', function (_req, res) {
  res.json({ ok: true, service: 'finsight-agent', riskNotice: service.RISK_NOTICE });
});

router.post('/radar', function (req, res) {
  res.json(service.buildRadarAgent(req.body || {}));
});

router.post('/life-plan', function (req, res) {
  res.json(service.buildFinancialProfile(req.body || {}));
});

router.post('/backtest', function (req, res) {
  res.json(service.buildBacktest(req.body || {}));
});

module.exports = router;
