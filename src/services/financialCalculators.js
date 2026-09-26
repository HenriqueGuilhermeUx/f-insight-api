function finiteNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${field} must be a finite number`);
    error.code = 'invalid_number';
    throw error;
  }
  return parsed;
}

function nonNegative(value, field) {
  const parsed = finiteNumber(value, field);
  if (parsed < 0) {
    const error = new Error(`${field} must be non-negative`);
    error.code = 'invalid_range';
    throw error;
  }
  return parsed;
}

function positive(value, field) {
  const parsed = finiteNumber(value, field);
  if (parsed <= 0) {
    const error = new Error(`${field} must be greater than zero`);
    error.code = 'invalid_range';
    throw error;
  }
  return parsed;
}

function bounded(value, field, min, max) {
  const parsed = finiteNumber(value, field);
  if (parsed < min || parsed > max) {
    const error = new Error(`${field} must be between ${min} and ${max}`);
    error.code = 'invalid_range';
    throw error;
  }
  return parsed;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function monthlyRateFromAnnual(annualRatePct) {
  const annual = finiteNumber(annualRatePct, 'annualRatePct') / 100;
  if (annual <= -1) {
    const error = new Error('annualRatePct must be greater than -100');
    error.code = 'invalid_range';
    throw error;
  }
  return (1 + annual) ** (1 / 12) - 1;
}

function compoundWithContributions(input = {}) {
  const principal = nonNegative(input.principal ?? 0, 'principal');
  const monthlyContribution = nonNegative(input.monthlyContribution ?? 0, 'monthlyContribution');
  const annualRatePct = finiteNumber(input.annualRatePct ?? 0, 'annualRatePct');
  const months = Math.trunc(bounded(input.months, 'months', 1, 1200));
  const contributionTiming = input.contributionTiming === 'beginning' ? 'beginning' : 'end';
  const monthlyRate = monthlyRateFromAnnual(annualRatePct);

  let balance = principal;
  for (let month = 0; month < months; month += 1) {
    if (contributionTiming === 'beginning') balance += monthlyContribution;
    balance *= 1 + monthlyRate;
    if (contributionTiming === 'end') balance += monthlyContribution;
  }

  const totalContributed = principal + monthlyContribution * months;
  return {
    type: 'compound_with_contributions',
    principal: round(principal),
    monthlyContribution: round(monthlyContribution),
    annualRatePct: round(annualRatePct, 6),
    effectiveMonthlyRatePct: round(monthlyRate * 100, 8),
    months,
    contributionTiming,
    totalContributed: round(totalContributed),
    finalBalance: round(balance),
    totalReturn: round(balance - totalContributed),
    assumptions: ['Taxas constantes são apenas premissas de cálculo.', 'Não inclui impostos, custos ou inflação salvo quando informados em cálculo separado.'],
  };
}

function realReturn(input = {}) {
  const nominalAnnualRatePct = finiteNumber(input.nominalAnnualRatePct, 'nominalAnnualRatePct');
  const inflationAnnualPct = finiteNumber(input.inflationAnnualPct, 'inflationAnnualPct');
  if (nominalAnnualRatePct <= -100 || inflationAnnualPct <= -100) {
    const error = new Error('rates must be greater than -100%');
    error.code = 'invalid_range';
    throw error;
  }
  const nominal = nominalAnnualRatePct / 100;
  const inflation = inflationAnnualPct / 100;
  const real = (1 + nominal) / (1 + inflation) - 1;
  return {
    type: 'real_return',
    nominalAnnualRatePct: round(nominalAnnualRatePct, 6),
    inflationAnnualPct: round(inflationAnnualPct, 6),
    realAnnualRatePct: round(real * 100, 6),
    formula: '(1 + nominal) / (1 + inflation) - 1',
    assumptions: ['Compara taxas anuais equivalentes.', 'Não inclui impostos ou custos.'],
  };
}

function fixedIncomeScenario(input = {}) {
  const principal = nonNegative(input.principal ?? 0, 'principal');
  const annualRatePct = finiteNumber(input.annualRatePct, 'annualRatePct');
  const months = Math.trunc(bounded(input.months, 'months', 1, 1200));
  const taxRatePct = bounded(input.taxRatePct ?? 0, 'taxRatePct', 0, 100);
  const annual = annualRatePct / 100;
  if (annual <= -1) {
    const error = new Error('annualRatePct must be greater than -100');
    error.code = 'invalid_range';
    throw error;
  }
  const years = months / 12;
  const grossBalance = principal * (1 + annual) ** years;
  const grossReturn = grossBalance - principal;
  const taxAmount = Math.max(0, grossReturn) * (taxRatePct / 100);
  const netBalance = grossBalance - taxAmount;

  return {
    type: 'fixed_income_scenario',
    principal: round(principal),
    annualRatePct: round(annualRatePct, 6),
    months,
    taxRatePct: round(taxRatePct, 6),
    grossReturn: round(grossReturn),
    grossBalance: round(grossBalance),
    taxAmount: round(taxAmount),
    netReturn: round(netBalance - principal),
    netBalance: round(netBalance),
    assumptions: [
      'A taxa anual é tratada como efetiva e constante durante todo o período.',
      'A alíquota de imposto é fornecida pelo usuário; o motor não presume tabela tributária, produto ou enquadramento fiscal.',
      'Não inclui taxas, spreads, marcação a mercado, risco de crédito ou liquidez.',
    ],
  };
}

function benchmarkPercentageScenario(input = {}) {
  const benchmarkAnnualRatePct = finiteNumber(input.benchmarkAnnualRatePct, 'benchmarkAnnualRatePct');
  const benchmarkPercentagePct = nonNegative(input.benchmarkPercentagePct, 'benchmarkPercentagePct');
  const equivalentAnnualRatePct = benchmarkAnnualRatePct * (benchmarkPercentagePct / 100);
  const scenario = fixedIncomeScenario({
    principal: input.principal,
    annualRatePct: equivalentAnnualRatePct,
    months: input.months,
    taxRatePct: input.taxRatePct ?? 0,
  });
  return {
    ...scenario,
    type: 'benchmark_percentage_scenario',
    benchmarkAnnualRatePct: round(benchmarkAnnualRatePct, 6),
    benchmarkPercentagePct: round(benchmarkPercentagePct, 6),
    equivalentAnnualRatePct: round(equivalentAnnualRatePct, 6),
    assumptions: [
      'A conversão percentual do benchmark é uma simplificação educacional sobre uma taxa anual informada.',
      ...scenario.assumptions,
    ],
  };
}

function averagePrice(input = {}) {
  const currentQuantity = nonNegative(input.currentQuantity ?? 0, 'currentQuantity');
  const currentAveragePrice = nonNegative(input.currentAveragePrice ?? 0, 'currentAveragePrice');
  const newQuantity = positive(input.newQuantity, 'newQuantity');
  const newUnitPrice = nonNegative(input.newUnitPrice, 'newUnitPrice');
  const costs = nonNegative(input.costs ?? 0, 'costs');
  const totalQuantity = currentQuantity + newQuantity;
  const currentCost = currentQuantity * currentAveragePrice;
  const newCost = newQuantity * newUnitPrice + costs;
  const totalCost = currentCost + newCost;
  return {
    type: 'average_price',
    currentQuantity: round(currentQuantity, 8),
    newQuantity: round(newQuantity, 8),
    totalQuantity: round(totalQuantity, 8),
    totalCost: round(totalCost),
    newAveragePrice: round(totalCost / totalQuantity, 8),
    assumptions: ['Custos opcionais informados são somados ao custo da nova aquisição.', 'Não calcula efeitos fiscais.'],
  };
}

function dividendYield(input = {}) {
  const annualDividendPerUnit = nonNegative(input.annualDividendPerUnit, 'annualDividendPerUnit');
  const referencePrice = positive(input.referencePrice, 'referencePrice');
  return {
    type: 'dividend_yield',
    annualDividendPerUnit: round(annualDividendPerUnit, 8),
    referencePrice: round(referencePrice, 8),
    dividendYieldPct: round((annualDividendPerUnit / referencePrice) * 100, 6),
    assumptions: ['Usa apenas os valores informados.', 'Dividendos passados ou informados não representam garantia de pagamentos futuros.'],
  };
}

const calculators = {
  compound_with_contributions: compoundWithContributions,
  real_return: realReturn,
  fixed_income_scenario: fixedIncomeScenario,
  benchmark_percentage_scenario: benchmarkPercentageScenario,
  average_price: averagePrice,
  dividend_yield: dividendYield,
};

function calculate(type, input) {
  const calculator = calculators[type];
  if (!calculator) {
    const error = new Error(`unsupported calculation type: ${type}`);
    error.code = 'unsupported_calculation';
    throw error;
  }
  return calculator(input || {});
}

module.exports = {
  calculate,
  calculators,
  compoundWithContributions,
  realReturn,
  fixedIncomeScenario,
  benchmarkPercentageScenario,
  averagePrice,
  dividendYield,
};
