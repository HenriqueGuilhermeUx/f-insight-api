'use strict';

const express = require('express');
const router = express.Router();
const quantLab = require('../services/quantLabEngine');

router.get('/health', function (_req, res) {
  res.json({
    ok: true,
    service: 'finsight-quant-lab',
    mode: 'internal-engine',
    riskNotice: quantLab.RISK_NOTICE,
    sources: quantLab.sourcePlan(),
  });
});

router.get('/sources', function (_req, res) {
  res.json({ ok: true, sources: quantLab.sourcePlan() });
});

router.post('/manual-scan', function (req, res) {
  try {
    res.json(quantLab.runManualScan(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'QUANT_LAB_SCAN_FAILED', message: error.message });
  }
});

router.post('/price-option', function (req, res) {
  try {
    const price = quantLab.blackScholesPrice(req.body || {});
    const iv = req.body?.premium ? quantLab.impliedVolatility(req.body || {}) : null;
    const probability = quantLab.riskNeutralProbability({
      ...(req.body || {}),
      annualVolatility: iv || req.body?.annualVolatility,
    });
    res.json({ ok: true, price, impliedVolatility: iv, riskNeutralProbability: probability, riskNotice: quantLab.RISK_NOTICE });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'OPTION_PRICING_FAILED', message: error.message });
  }
});

module.exports = router;
