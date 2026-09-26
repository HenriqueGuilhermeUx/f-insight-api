const express = require('express');
const { calculate, calculators } = require('../services/financialCalculators');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    mode: 'educational-calculations',
    recommendation: false,
    execution: false,
    externalMarketDataUsed: false,
    calculators: Object.keys(calculators),
    policy: {
      inputsMustBeProvided: true,
      hiddenProductAssumptions: false,
      investmentRanking: false,
      buySellSignal: false,
    },
  });
});

router.post('/calculate', (req, res) => {
  try {
    const type = String(req.body?.type || '').trim();
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    const result = calculate(type, input);
    return res.json({
      ok: true,
      result,
      methodology: {
        deterministic: true,
        recommendation: false,
        execution: false,
        externalMarketDataUsed: false,
        inputsEchoedInResult: true,
      },
    });
  } catch (error) {
    const clientError = ['invalid_number', 'invalid_range', 'unsupported_calculation'].includes(error.code);
    return res.status(clientError ? 400 : 500).json({
      ok: false,
      error: error.code || 'calculation_failed',
      message: error.message,
    });
  }
});

module.exports = router;
