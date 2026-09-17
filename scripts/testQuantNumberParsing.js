'use strict';

const quantLab = require('../src/services/quantLabEngine');

function assertClose(actual, expected, tolerance, message) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`ASSERTION_FAILED: ${message}. actual=${actual} expected=${expected}`);
  }
}

const fromDecimalString = quantLab.blackScholesPrice({
  type: 'call',
  spot: '42.10',
  strike: '45',
  daysToExpiry: '90',
  riskFreeRate: '0.12',
  annualVolatility: '0.34',
});

const fromNumbers = quantLab.blackScholesPrice({
  type: 'call',
  spot: 42.10,
  strike: 45,
  daysToExpiry: 90,
  riskFreeRate: 0.12,
  annualVolatility: 0.34,
});

const fromBrazilianStrings = quantLab.blackScholesPrice({
  type: 'call',
  spot: '42,10',
  strike: '45,00',
  daysToExpiry: '90',
  riskFreeRate: '0,12',
  annualVolatility: '0,34',
});

assertClose(fromDecimalString, fromNumbers, 1e-10, 'decimal string parsing should preserve decimals');
assertClose(fromBrazilianStrings, fromNumbers, 1e-10, 'Brazilian decimal parsing should preserve decimals');

console.log(JSON.stringify({ ok: true, fromNumbers, fromDecimalString, fromBrazilianStrings }, null, 2));
