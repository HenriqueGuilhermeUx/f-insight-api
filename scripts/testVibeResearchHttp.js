'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const express = require('express');

async function startServer(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function closeServer(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((err) => err ? reject(err) : resolve()));
}

test('Vibe HTTP endpoints are internal-only and read-only', async () => {
  const saved = {
    FINSIGHT_INTERNAL_API_KEY: process.env.FINSIGHT_INTERNAL_API_KEY,
    VIBE_RESEARCH_BASE_URL: process.env.VIBE_RESEARCH_BASE_URL,
    VIBE_RESEARCH_API_KEY: process.env.VIBE_RESEARCH_API_KEY,
    INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH: process.env.INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH,
  };
  const upstreamRequests = [];
  const upstream = createServer((req, res) => {
    upstreamRequests.push({ method: req.method, path: req.url });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/alpha/readiness'
      ? { universes: { sp500: { ready: true }, 'btc-usdt': { ready: false },
          csi300: { ready: false, reason: 'token unavailable' } } }
      : req.url.startsWith('/alpha/list')
      ? { status: 'ok', alphas: [{ id: 'alpha101_001', zoo: 'alpha101', theme: ['momentum'], universe: ['equity_us'] }], total: 1, returned: 1, truncated: false }
      : { status: 'ok', alpha: { id: 'alpha101_001', zoo: 'alpha101', module_path: '/private.py',
          meta: { theme: ['momentum'], universe: ['equity_us'], nickname: 'Test factor' } },
          source_code: 'print("private")' }));
  });
  const upstreamPort = await startServer(upstream);

  let server;
  try {
    process.env.FINSIGHT_INTERNAL_API_KEY = 'ci-test-only-internal-key-123';
    process.env.VIBE_RESEARCH_BASE_URL = 'http://127.0.0.1:' + upstreamPort;
    delete process.env.VIBE_RESEARCH_API_KEY;

    const app = express();
    app.use('/api/internal/vibe-research', require('../src/routes/internalVibeResearch'));
    server = createServer(app);
    const apiPort = await startServer(server);
    const url = 'http://127.0.0.1:' + apiPort + '/api/internal/vibe-research';

    const noKey = await fetch(url + '/alphas');
    assert.equal(noKey.status, 401);
    assert.equal(upstreamRequests.length, 0);

    // Legacy test-mode override must never unlock the Vibe integration.
    process.env.INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH = 'true';
    delete process.env.FINSIGHT_INTERNAL_API_KEY;
    const overrideAttempt = await fetch(url + '/alphas');
    assert.equal(overrideAttempt.status, 503);
    assert.equal(upstreamRequests.length, 0);
    process.env.FINSIGHT_INTERNAL_API_KEY = 'ci-test-only-internal-key-123';
    delete process.env.INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH;

    const headers = { 'X-FInsight-Internal-Key': process.env.FINSIGHT_INTERNAL_API_KEY };
    const ready = await fetch(url + '/health', { headers });
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).execution, false);

    const valid = await fetch(url + '/alphas', { headers });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).researchOnly, true);
    assert.deepEqual(upstreamRequests, [{ method: 'GET', path: '/alpha/list' }]);
    const detail = await fetch(url + '/alphas/alpha101_001', { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.data.sourceCodeIncluded, false);
    assert.ok(!JSON.stringify(detailBody).includes('private'));
    assert.deepEqual(upstreamRequests, [
      { method: 'GET', path: '/alpha/list' },
      { method: 'GET', path: '/alpha/alpha101_001' },
    ]);

    const filtered = await fetch(url + '/alphas?universe=equity_us&zoo=academic&limit=10', { headers });
    assert.equal(filtered.status, 200);
    assert.equal((await filtered.json()).data.alphas.length, 1);
    assert.deepEqual(upstreamRequests.at(-1), {
      method: 'GET', path: '/alpha/list?universe=equity_us&zoo=academic&limit=10',
    });
    const beforeBad = upstreamRequests.length;
    const forbidden = await fetch(url + '/alphas?universe=equity_br', { headers });
    assert.equal(forbidden.status, 400);
    assert.equal(upstreamRequests.length, beforeBad);

    const invalid = await fetch(url + '/alphas/..%2Fsettings%2Fllm', { headers });
    assert.equal(invalid.status, 400);
    assert.equal(upstreamRequests.length, 3);

    const malformedId = await fetch(url + '/alphas/bad', { headers });
    assert.equal(malformedId.status, 400);
    assert.equal(upstreamRequests.length, 3);

    const method = await fetch(url + '/alphas', { method: 'POST', headers });
    assert.equal(method.status, 404);
    assert.equal(upstreamRequests.length, 3);

    const readiness = await fetch(url + '/readiness', { headers });
    assert.equal(readiness.status, 200);
    const preflight = (await readiness.json()).data;
    assert.equal(preflight.usEquityBacktestConfigured, true);
    assert.equal(preflight.cryptoCrossSectionalBacktestConfigured, false);
    assert.equal(preflight.orderExecutionEnabled, false);
    assert.equal(preflight.dataFreshnessVerified, false);
    assert.equal(upstreamRequests.at(-1).path, '/alpha/readiness');
    assert.equal(upstreamRequests.at(-1).method, 'GET');
  } finally {
    if (server) await closeServer(server);
    await closeServer(upstream);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
