'use strict';

const express = require('express');
const router = express.Router();
const terminal = require('../services/marketTerminalEngine');
const quantLab = require('../services/quantLabEngine');
const optionsAnalytics = require('../services/marketTerminal/optionsAnalytics');
const strategyEngine = require('../services/marketTerminal/strategyEngine');
const { parseOptionChainCsv } = require('../services/marketTerminal/optionChainCsv');
const { requireInternalAccess } = require('../services/marketTerminal/internalAccess');

router.use(requireInternalAccess);

router.get('/health', function (_req, res) {
  res.json({
    ok: true,
    service: 'finsight-market-terminal-internal',
    mode: 'internal-only',
    providers: terminal.providerStatus(),
    architecture: terminal.architecturePlan(),
    notice: terminal.INTERNAL_NOTICE,
  });
});

router.get('/providers', function (_req, res) {
  res.json({ ok: true, providers: terminal.providerStatus() });
});

router.get('/tradingview/:symbol', function (req, res) {
  res.json({ ok: true, plan: terminal.buildTradingViewWidgetPlan(req.params.symbol) });
});

router.get('/asset/:symbol', async function (req, res) {
  try {
    const result = await terminal.buildAssetResearchBundle(req.params.symbol, {
      range: req.query.range || '1y',
      interval: req.query.interval || '1d',
      quote: req.query.quote !== 'false',
      news: req.query.news !== 'false',
      history: req.query.history !== 'false',
      macro: req.query.macro !== 'false',
      externalSentiment: req.query.sentiment !== 'false',
      openbbProvider: req.query.provider,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: 'ASSET_RESEARCH_FAILED', message: error.message });
  }
});

router.get('/macro', async function (_req, res) {
  try {
    res.json(await terminal.bcb.getMacroSnapshot());
  } catch (error) {
    res.status(502).json({ ok: false, error: 'BCB_FETCH_FAILED', message: error.message });
  }
});

router.get('/bcb/series/:code', async function (req, res) {
  try {
    res.json(await terminal.bcb.getSeries(req.params.code, { last: req.query.last }));
  } catch (error) {
    res.status(502).json({ ok: false, error: 'BCB_SERIES_FAILED', message: error.message });
  }
});

router.get('/cvm/sources', function (_req, res) {
  res.json({ ok: true, sources: terminal.cvm.sourceCatalog() });
});

router.get('/cvm/search', async function (req, res) {
  try {
    const results = await terminal.cvm.searchCompanies(req.query.q || '', { limit: req.query.limit });
    res.json({ ok: true, count: results.length, results, sources: terminal.cvm.sourceCatalog() });
  } catch (error) {
    res.status(502).json({ ok: false, error: 'CVM_SEARCH_FAILED', message: error.message });
  }
});

router.post('/options/import-csv', function (req, res) {
  const parsed = parseOptionChainCsv(req.body?.csv || req.body?.text || '', req.body?.defaults || {});
  res.status(parsed.errors.length && !parsed.rows.length ? 400 : 200).json({ ok: parsed.rows.length > 0, ...parsed });
});

router.post('/quant/option-risk', function (req, res) {
  try {
    res.json({ ok: true, analysis: optionsAnalytics.analyzeLongOption(req.body || {}) });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'OPTION_RISK_FAILED', message: error.message });
  }
});

router.post('/quant/strategy', function (req, res) {
  try {
    res.json(strategyEngine.analyzeStrategy(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'STRATEGY_ANALYSIS_FAILED', message: error.message });
  }
});

router.post('/quant/scan', function (req, res) {
  try {
    res.json(quantLab.runManualScan(req.body || {}));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'QUANT_SCAN_FAILED', message: error.message });
  }
});

router.post('/quant/scan-from-market', async function (req, res) {
  try {
    const payload = req.body || {};
    const symbol = payload.symbol || payload.underlying;
    if (!symbol) return res.status(400).json({ ok: false, error: 'SYMBOL_REQUIRED' });
    const bundle = await terminal.buildAssetResearchBundle(symbol, {
      range: payload.range || '1y',
      interval: '1d',
      quote: true,
      news: false,
      macro: true,
      externalSentiment: false,
    });
    const volatility = payload.annualVolatility || bundle.analytics?.volatility?.hv60 || bundle.analytics?.volatility?.hv120 || quantLab.DEFAULTS.annualVolatility;
    const drift = payload.annualDrift ?? bundle.analytics?.annualizedDrift ?? quantLab.DEFAULTS.annualDrift;
    const macroRiskFreeRate = (bundle.macro?.snapshot?.selicTarget?.value || 0) / 100;
    const riskFreeRate = payload.riskFreeRate ?? (macroRiskFreeRate || quantLab.DEFAULTS.riskFreeRate);
    const spot = payload.spot || bundle.quote?.price || bundle.analytics?.lastPrice;
    const result = quantLab.runManualScan({
      ...payload,
      symbol,
      spot,
      annualVolatility: volatility,
      annualDrift: drift,
      riskFreeRate,
    });
    res.json({
      ...result,
      marketContext: {
        spot,
        annualVolatility: volatility,
        annualDrift: drift,
        riskFreeRate,
        historyProvider: bundle.history?.selectedProvider || bundle.history?.provider || null,
        observations: bundle.analytics?.observations || 0,
        trend: bundle.analytics?.trend || null,
        maxDrawdown: bundle.analytics?.maxDrawdown ?? null,
      },
      sourceErrors: bundle.errors,
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'MARKET_QUANT_SCAN_FAILED', message: error.message });
  }
});

module.exports = router;
