'use strict';

const DEFAULT_ASSUMPTIONS = {
  conservativeAnnualRate: 0.04,
  baseAnnualRate: 0.07,
  acceleratedAnnualRate: 0.09,
  workHoursPerMonth: 176,
};

const RISK_NOTICE = 'Conteúdo educativo e de simulação. Não é recomendação individualizada de investimento, não promete rentabilidade e não executa ordens.';

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function money(value) {
  return Number.isFinite(value)
    ? `R$ ${value.toFixed(2).replace('.', ',')}`
    : 'R$ 0,00';
}

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, '')
    .slice(0, 16);
}

function futureValue(monthlyContribution, annualRate, years) {
  const monthly = Math.max(0, toNumber(monthlyContribution));
  const months = Math.max(1, Math.round(toNumber(years, 10) * 12));
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  if (monthlyRate === 0) return monthly * months;
  return monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
}

function extractMoneyValues(text) {
  const matches = String(text || '').match(/(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:,\d{2})/g) || [];
  return matches
    .map((raw) => toNumber(raw))
    .filter((value) => Number.isFinite(value) && Math.abs(value) > 0)
    .slice(0, 200);
}

function classifyTextTransactions(text) {
  const lower = String(text || '').toLowerCase();
  const values = extractMoneyValues(text);
  const totalDetected = values.reduce((sum, value) => sum + Math.abs(value), 0);

  const categoryHints = [
    { key: 'delivery', label: 'Delivery/conveniência', terms: ['ifood', 'rappi', 'delivery', 'uber eats', 'pizza', 'hamburguer'] },
    { key: 'transport', label: 'Transporte', terms: ['uber', '99', 'posto', 'gasolina', 'shell', 'ipiranga', 'estacionamento'] },
    { key: 'fees', label: 'Juros/taxas', terms: ['juros', 'rotativo', 'multa', 'tarifa', 'encargo', 'iof'] },
    { key: 'subscriptions', label: 'Assinaturas', terms: ['netflix', 'spotify', 'prime', 'google', 'apple', 'assinatura', 'recorrente'] },
    { key: 'market', label: 'Mercado/alimentação base', terms: ['mercado', 'supermercado', 'atacadao', 'pao de acucar', 'carrefour'] },
  ];

  const categories = categoryHints.map((item) => {
    const hits = item.terms.filter((term) => lower.includes(term));
    const estimatedShare = hits.length > 0 ? Math.min(0.35, 0.06 * hits.length) : 0;
    return {
      key: item.key,
      label: item.label,
      hits,
      estimatedValue: totalDetected * estimatedShare,
    };
  }).filter((item) => item.hits.length > 0 || item.estimatedValue > 0);

  return {
    detectedValues: values.length,
    totalDetected,
    categories,
  };
}

function buildFinancialProfile(input = {}) {
  const income = toNumber(input.income || input.monthlyIncome);
  const expenses = toNumber(input.expenses || input.monthlyExpenses);
  const savings = toNumber(input.savings || input.monthlySavings);
  const debt = toNumber(input.debt || input.totalDebt);
  const dependents = Math.max(0, toNumber(input.dependents));
  const age = Math.max(0, toNumber(input.age));
  const objective = String(input.objective || 'Organizar vida financeira');
  const targetAmount = toNumber(input.targetAmount || input.goalAmount);
  const years = Math.max(1, toNumber(input.years || input.goalYears, 10));
  const statementText = String(input.statementText || input.transactionsText || '');
  const transactionSignal = classifyTextTransactions(statementText);

  const monthlyBalance = income - expenses - savings;
  const savingsRate = income > 0 ? savings / income : 0;
  const debtPressure = income > 0 ? debt / income : 0;
  const leakPotential = Math.max(
    0,
    monthlyBalance * 0.5 +
    transactionSignal.categories.reduce((sum, item) => {
      if (['delivery', 'fees', 'subscriptions'].includes(item.key)) return sum + item.estimatedValue * 0.4;
      return sum;
    }, 0)
  );
  const hourlyIncome = income > 0 ? income / DEFAULT_ASSUMPTIONS.workHoursPerMonth : 0;
  const workHoursRecoverable = hourlyIncome > 0 ? leakPotential / hourlyIncome : 0;

  let persona = 'Malabarista';
  let stage = 'A renda mantém o mês em pé, mas ainda não compra futuro com consistência.';
  let realTalk = 'Seu dinheiro está pagando a rotina, mas ainda não está defendendo sua liberdade. O primeiro passo é criar folga real.';

  if (monthlyBalance < 0 || debtPressure > 2) {
    persona = 'Sangria';
    stage = 'A prioridade é parar o buraco antes de falar em sofisticação.';
    realTalk = 'Você não precisa de uma carteira incrível agora. Precisa estancar dívida, custo fixo e gasto impulsivo que tiram seu poder de escolha.';
  } else if (monthlyBalance > income * 0.12 && savings < monthlyBalance * 0.5) {
    persona = 'Vazamento Silencioso';
    stage = 'Sobra dinheiro, mas parte dele não vira patrimônio nem tranquilidade.';
    realTalk = 'O problema não é falta de renda. É falta de direção. Seu dinheiro provavelmente está financiando conveniência antes de financiar liberdade.';
  } else if (savingsRate > 0 && savingsRate < 0.1) {
    persona = 'Poupador Fraco';
    stage = 'Você guarda, mas pouco para a ambição declarada.';
    realTalk = 'Você começou certo, mas ainda negocia com o próprio futuro. A meta precisa virar compromisso mensal.';
  } else if (savingsRate >= 0.1) {
    persona = savingsRate >= 0.25 ? 'Estrategista' : 'Construtor';
    stage = savingsRate >= 0.25
      ? 'Agora o jogo é proteger, otimizar e transformar patrimônio em liberdade.'
      : 'Você já constrói, mas precisa conectar aportes com objetivos claros.';
    realTalk = savingsRate >= 0.25
      ? 'Você tem disciplina. O próximo salto é clareza: para que vida exatamente esse patrimônio está trabalhando?'
      : 'Você está no caminho. Agora precisa parar de acumular no escuro e transformar cada aporte em avanço mensurável.';
  }

  if (/sair|vermelho|d[ií]vida/i.test(objective) && debt > 0) {
    realTalk = `Sua prioridade não é render mais: é parar de pagar o passado. A dívida declarada de ${money(debt)} precisa virar plano de ataque.`;
  }

  if (dependents > 0 && persona !== 'Sangria') {
    realTalk += ` Como existem ${dependents} dependente(s), cada vazamento também atrasa proteção familiar e liberdade futura.`;
  }

  const freedomScore = clamp(
    Math.round(35 + savingsRate * 180 - Math.max(0, debtPressure - 0.5) * 18 + (monthlyBalance > 0 ? 10 : -15) + (targetAmount > 0 ? 8 : 0)),
    0,
    100
  );

  return {
    type: 'life-plan-analysis',
    generatedAt: new Date().toISOString(),
    riskNotice: RISK_NOTICE,
    inputSummary: {
      objective,
      age,
      dependents,
      income,
      expenses,
      savings,
      debt,
      targetAmount,
      years,
      statementLinesDetected: transactionSignal.detectedValues,
    },
    diagnosis: {
      persona,
      stage,
      realTalk,
      freedomScore,
      monthlyBalance,
      savingsRate,
      leakPotential,
      workHoursRecoverable,
    },
    transactionSignal,
    scenarios: {
      conservative: futureValue(Math.max(0, savings), DEFAULT_ASSUMPTIONS.conservativeAnnualRate, years),
      base: futureValue(Math.max(0, savings + leakPotential * 0.5), DEFAULT_ASSUMPTIONS.baseAnnualRate, years),
      accelerated: futureValue(Math.max(0, savings + leakPotential), DEFAULT_ASSUMPTIONS.acceleratedAnnualRate, years),
    },
    opportunities: [
      leakPotential > 0
        ? `Redirecionar ${money(leakPotential)} por mês de vazamentos para a meta. Isso representa ${workHoursRecoverable.toFixed(1).replace('.', ',')} horas de trabalho recuperáveis.`
        : 'Criar um valor mínimo automático para a meta antes do dinheiro circular no mês.',
      debt > 0
        ? `Atacar a dívida de ${money(debt)} antes de aumentar risco. Dívida cara é um anti-investimento.`
        : 'Separar reserva de emergência antes de buscar complexidade.',
      targetAmount > 0
        ? `Transformar a meta de ${money(targetAmount)} em marcos trimestrais, não em desejo distante.`
        : 'Definir valor alvo e prazo. Sem alvo, qualquer sobra parece progresso.',
    ],
    missions: {
      sevenDays: persona === 'Sangria'
        ? 'Congelar gasto variável não essencial, listar todas as dívidas e escolher uma para renegociar primeiro.'
        : 'Escolher um vazamento, cortar ou reduzir, e transferir o valor para uma caixinha chamada Liberdade.',
      ninetyDays: [
        'Semana 1: organizar renda, custos fixos, dívidas e recorrências.',
        'Dia 30: criar folga mínima mensal e primeira meta automática.',
        'Dia 60: revisar comportamento de consumo e travar o maior vazamento.',
        'Dia 90: recalcular rota e transformar o plano em acompanhamento mensal.',
      ],
    },
    nextArchitecture: 'Quando Open Finance estiver ativo, esta análise deixa de ser pontual e passa a ser acompanhamento vivo com consentimento.',
  };
}

function buildRadarAgent(input = {}) {
  const query = String(input.query || input.prompt || '').trim();
  const symbol = normalizeSymbol(input.symbol || input.ticker || query.match(/[A-Z]{4}\d|BTC|ETH|IBOV|SPY|USDC/i)?.[0] || 'IBOV');
  const horizon = String(input.horizon || '6 meses');
  const objective = String(input.objective || 'entender cenário');

  const isCrypto = /BTC|ETH|USDC|CRYPTO|CRIPTO/i.test(symbol + ' ' + query);
  const isBacktest = /backtest|simul|teria acontecido|últimos|ultimos|meses|anos/i.test(query);
  const isPersonal = /aposentar|d[ií]vida|reserva|guardar|acumular|renda/i.test(query + ' ' + objective);

  return {
    type: 'radar-agent-analysis',
    generatedAt: new Date().toISOString(),
    riskNotice: RISK_NOTICE,
    query: query || `Analisar ${symbol} em ${horizon}`,
    normalized: {
      symbol,
      horizon,
      objective,
      mode: isPersonal ? 'objetivo-financeiro' : isBacktest ? 'simulacao-backtest' : 'pesquisa-radar',
      assetClass: isCrypto ? 'cripto' : 'mercado-tradicional',
    },
    answer: {
      headline: `Radar educativo para ${symbol}`,
      summary: `A análise deve separar preço, cenário macro, risco, prazo e objetivo. O F-Insight Agent não executa ordens e não diz comprar ou vender.`,
      whatToCheck: [
        'Tendência do preço no horizonte solicitado.',
        'Volatilidade e quedas máximas relevantes.',
        'Contexto macro: juros, câmbio, liquidez e notícias.',
        'Compatibilidade com objetivo e prazo do usuário.',
      ],
      simulationPlan: [
        'Coletar série histórica do ativo/índice.',
        'Comparar buy and hold, aportes mensais e cenário conservador/base/acelerado.',
        'Mostrar retorno, drawdown, meses negativos e sensibilidade ao prazo.',
        'Gerar conclusão educativa com limitações claras.',
      ],
      guardrails: [
        'Não recomendar compra, venda ou alocação personalizada.',
        'Não prometer rentabilidade.',
        'Não executar trades no app.',
        'Sempre mostrar riscos, premissas e limites da simulação.',
      ],
      nextQuestions: [
        'Qual objetivo esse ativo teria na sua vida financeira?',
        'Qual prazo real do dinheiro: meses, anos ou aposentadoria?',
        'Você suportaria uma queda relevante sem vender no pior momento?',
      ],
    },
    productHooks: {
      appModule: 'Radar IA',
      backendPath: '/api/agent/radar',
      futureIntegration: 'Conectar com Futuro IA e Open Finance para comparar tese de mercado com capacidade real de aporte do usuário.',
    },
  };
}

function buildBacktest(input = {}) {
  const monthlyContribution = toNumber(input.monthlyContribution || input.monthly || 500);
  const years = Math.max(1, toNumber(input.years || 10));
  const symbol = normalizeSymbol(input.symbol || input.ticker || 'IBOV');

  return {
    type: 'educational-backtest-skeleton',
    generatedAt: new Date().toISOString(),
    riskNotice: RISK_NOTICE,
    symbol,
    assumptions: {
      monthlyContribution,
      years,
      note: 'MVP usa cenários de taxa anual. Próxima fase usará série histórica real.',
    },
    scenarios: {
      conservative: futureValue(monthlyContribution, DEFAULT_ASSUMPTIONS.conservativeAnnualRate, years),
      base: futureValue(monthlyContribution, DEFAULT_ASSUMPTIONS.baseAnnualRate, years),
      accelerated: futureValue(monthlyContribution, DEFAULT_ASSUMPTIONS.acceleratedAnnualRate, years),
    },
    interpretation: [
      `Aporte mensal de ${money(monthlyContribution)} por ${years} anos cria disciplina antes de tentar acertar timing.`,
      'O valor final depende de prazo, consistência, risco e custo de oportunidade.',
      'Na próxima fase, o motor deve comparar série histórica, drawdown e meses negativos.',
    ],
  };
}

module.exports = {
  buildRadarAgent,
  buildFinancialProfile,
  buildBacktest,
  RISK_NOTICE,
};
