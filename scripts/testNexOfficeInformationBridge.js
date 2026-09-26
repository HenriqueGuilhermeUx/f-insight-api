const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { calculate } = require('../src/services/financialCalculators');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/nexofficeInformation.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
const macro = fs.readFileSync(path.join(__dirname, '../src/services/macroService.js'), 'utf8');

function includes(value, label) {
  assert.ok(route.includes(value), `missing bridge contract: ${label || value}`);
}

includes("NEXOFFICE_INFORMATION_BRIDGE_ENABLED !== 'true'", 'feature gate defaults closed');
includes('FINSIGHT_NEXOFFICE_SERVICE_KEY', 'dedicated service key');
includes("req.get('X-NexOffice-Key')", 'service key header');
includes("req.get('X-NexOffice-Workspace-ID')", 'workspace header');
includes('crypto.timingSafeEqual', 'constant-time credential comparison');
includes('REQUESTS_PER_MINUTE', 'rate limit');
includes("router.get('/health'", 'health endpoint');
includes("router.get('/radar'", 'radar endpoint');
includes("router.get('/assets/:symbol'", 'asset snapshot endpoint');
includes("router.get('/macro'", 'macro context endpoint');
includes("router.get('/news'", 'news endpoint');
includes("router.post('/calculate'", 'calculation endpoint');
includes('recommendation: false', 'no recommendation policy');
includes('execution: false', 'no execution policy');
includes('ranking: false', 'no ranking policy');
includes('buySellSignal: false', 'no buy/sell signal policy');
includes('portfolioAdvice: false', 'no portfolio advice policy');
includes('advisorClientData: false', 'no advisor client data policy');
includes("excludedCapabilities: ['allocation_signals', 'recommendations', 'orders', 'execution', 'portfolio_advice', 'advisor_clients', 'professional_crm', 'quant_lab']", 'explicit exclusions');

const forbiddenRequires = [
  "require('../routes/allocationSignals')",
  "require('./allocationSignals')",
  "require('../services/quantLabEngine')",
  "require('../services/marketTerminal/strategyEngine')",
  "require('../services/marketTerminal/optionsAnalytics')",
  "require('../services/advisor",
  "require('../services/workspace",
];
for (const item of forbiddenRequires) {
  assert.ok(!route.includes(item), `bridge must not import prohibited capability: ${item}`);
}

for (const endpoint of ['/signals', '/orders', '/execute', '/portfolio', '/advisor', '/clients', '/quant']) {
  assert.ok(!new RegExp(`router\\.(get|post|put|patch|delete)\\(['\"]${endpoint.replace('/', '\\/')}`).test(route), `prohibited bridge endpoint: ${endpoint}`);
}

assert.ok(server.includes("app.use('/api/internal/nexoffice', nexofficeInformationRoutes)"), 'bridge must be mounted on internal namespace');
assert.ok(server.includes("'X-NexOffice-Key', 'X-NexOffice-Workspace-ID'"), 'server must allow service headers');
assert.ok(!macro.includes('fallback-offline'), 'macro service must not fabricate offline values');
assert.ok(!macro.includes('suggestedAction'), 'macro service must not generate suggested actions');
assert.ok(macro.includes('signals: []'), 'macro compatibility signals must remain empty');

const calculation = calculate('real_return', { nominalAnnualRatePct: 10, inflationAnnualPct: 5 });
assert.ok(Math.abs(calculation.realAnnualRatePct - 4.761905) < 0.000001, 'calculator math contract failed');

console.log(JSON.stringify({
  ok: true,
  service: 'finsight-nexoffice-information-v1',
  endpoints: ['health', 'radar', 'asset_snapshot', 'macro_context', 'news', 'calculate'],
  recommendation: false,
  execution: false,
  ranking: false,
  buySellSignal: false,
  advisorClientData: false,
  quantLab: false,
}));
