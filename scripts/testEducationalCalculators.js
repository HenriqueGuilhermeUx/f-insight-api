const assert = require('assert');
const {
  calculate,
  compoundWithContributions,
  realReturn,
  fixedIncomeScenario,
  benchmarkPercentageScenario,
  averagePrice,
  dividendYield,
} = require('../src/services/financialCalculators');

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const compound = compoundWithContributions({ principal: 1000, monthlyContribution: 100, annualRatePct: 0, months: 12 });
assert.strictEqual(compound.finalBalance, 2200);
assert.strictEqual(compound.totalContributed, 2200);
assert.strictEqual(compound.totalReturn, 0);

const real = realReturn({ nominalAnnualRatePct: 10, inflationAnnualPct: 5 });
close(real.realAnnualRatePct, 4.761905, 0.000001);

const fixed = fixedIncomeScenario({ principal: 1000, annualRatePct: 10, months: 12, taxRatePct: 20 });
assert.strictEqual(fixed.grossBalance, 1100);
assert.strictEqual(fixed.grossReturn, 100);
assert.strictEqual(fixed.taxAmount, 20);
assert.strictEqual(fixed.netBalance, 1080);

const benchmark = benchmarkPercentageScenario({ principal: 1000, benchmarkAnnualRatePct: 10, benchmarkPercentagePct: 100, months: 12, taxRatePct: 0 });
assert.strictEqual(benchmark.equivalentAnnualRatePct, 10);
assert.strictEqual(benchmark.netBalance, 1100);

const avg = averagePrice({ currentQuantity: 10, currentAveragePrice: 10, newQuantity: 10, newUnitPrice: 20, costs: 0 });
assert.strictEqual(avg.totalQuantity, 20);
assert.strictEqual(avg.newAveragePrice, 15);

const dy = dividendYield({ annualDividendPerUnit: 1, referencePrice: 20 });
assert.strictEqual(dy.dividendYieldPct, 5);

const dispatched = calculate('dividend_yield', { annualDividendPerUnit: 2, referencePrice: 40 });
assert.strictEqual(dispatched.dividendYieldPct, 5);

assert.throws(() => calculate('unknown', {}), /unsupported calculation type/);
assert.throws(() => compoundWithContributions({ months: 0, annualRatePct: 10 }), /months must be between/);
assert.throws(() => fixedIncomeScenario({ principal: 1000, annualRatePct: -100, months: 12 }), /greater than -100/);
assert.throws(() => dividendYield({ annualDividendPerUnit: 1, referencePrice: 0 }), /greater than zero/);

for (const result of [compound, real, fixed, benchmark, avg, dy]) {
  assert.ok(Array.isArray(result.assumptions) && result.assumptions.length > 0, `${result.type} missing assumptions`);
  assert.ok(!JSON.stringify(result).toLowerCase().includes('recomend'), `${result.type} should not embed a recommendation`);
}

console.log(JSON.stringify({
  ok: true,
  calculators: [
    'compound_with_contributions',
    'real_return',
    'fixed_income_scenario',
    'benchmark_percentage_scenario',
    'average_price',
    'dividend_yield',
  ],
  deterministic: true,
  recommendation: false,
  execution: false,
}));
