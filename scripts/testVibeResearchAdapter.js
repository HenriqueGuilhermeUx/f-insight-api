'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { listAlphas, alphaMetadata, validateBaseUrl, validateVibeListFilters } = require('../src/services/vibeResearchAdapter');

test('rejects unsafe upstream configuration', () => {
  assert.throws(() => validateBaseUrl('http://example.com'), /INVALID/);
  assert.throws(() => validateBaseUrl('https://user:pass@example.com'), /INVALID/);
  assert.throws(() => validateBaseUrl('file:///etc/passwd'), /INVALID/);
  assert.equal(validateBaseUrl('http://127.0.0.1:8899').hostname, '127.0.0.1');
});

test('reads only the vetted alpha list endpoint', async () => {
  const requests = [];
  const result = await listAlphas({
    baseUrl: 'http://localhost:8899',
    fetcher: async (url, args) => {
      requests.push({url, args});
      return {
        ok: true,
        headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
        text: async () => '{"status":"ok","alphas":[],"total":0,"truncated":false}',
      };
    },
  });
  assert.deepEqual(result, { alphas: [], total: 0, truncated: false });
  assert.equal(new URL(requests[0].url).pathname, '/alpha/list');
  assert.equal(requests[0].args.method, 'GET');
  assert.equal(requests[0].args.redirect, 'error');
});

test('rejects path manipulation and code execution verbs', async () => {
  await assert.rejects(alphaMetadata('../settings/llm', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
  await assert.rejects(alphaMetadata('research?x=1', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
  await assert.rejects(alphaMetadata('..', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
});


test('blocks unbounded streaming research responses before buffering', async () => {
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(512 * 1024 + 100));
      controller.close();
    },
  });
  await assert.rejects(
    listAlphas({
      baseUrl: 'https://vibe.staging.example',
      fetcher: async () => ({
        ok: true,
        headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
        body: upstream,
      }),
    }),
    /VIBE_RESPONSE_TOO_LARGE/,
  );
});


test('returns research metadata but never leaks upstream Python strategy source', async () => {
  const result = await alphaMetadata('alpha101_001', {
    baseUrl: 'http://localhost:8899',
    fetcher: async () => ({
      ok: true,
      headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({
        status: 'ok',
        alpha: {
          id: 'alpha101_001', zoo: 'alpha101',
          module_path: '/run/secrets/very-private.py',
          meta: { theme: ['momentum'], universe: ['equity_us'], nickname: 'Research indicator' },
        },
        source_code: 'print("PRIVATE")',
      }),
    }),
  });
  assert.equal(result.id, 'alpha101_001');
  assert.equal(result.sourceCodeIncluded, false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('module_path'));
  assert.deepEqual(result.universe, ['equity_us']);
});

test('strict market filters route only to approved Vibe read endpoints', async () => {
  for (const bad of [
    { universe: 'equity_br' }, { universe: 'https://evil.example' },
    { zoo: 'danger' }, { limit: -1 }, { limit: 101 },
    { limit: 1.5 }, { universe: ['crypto'] }, { unexpected: 'flag' },
  ]) assert.throws(() => validateVibeListFilters(bad), /INVALID_FILTERS/);
  const requests = [];
  const data = await listAlphas({
    baseUrl: 'http://127.0.0.1:8899',
    filters: { universe: 'crypto', zoo: 'academic', limit: 12 },
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        headers: { get: (key) => key === 'content-type' ? 'application/json' : null },
        text: async () => JSON.stringify({ status: 'ok', alphas: [], total: 0, truncated: false }),
      };
    },
  });
  const url = new URL(requests[0].url);
  assert.equal(url.pathname, '/alpha/list');
  assert.equal(url.searchParams.get('universe'), 'crypto');
  assert.equal(url.searchParams.get('zoo'), 'academic');
  assert.equal(url.searchParams.get('limit'), '12');
  assert.equal(requests[0].options.method, 'GET');
  assert.deepEqual(data.alphas, []);
});

test('production and strict staging fail closed unless HTTPS origin is pinned', async () => {
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    VIBE_RESEARCH_STRICT_EGRESS: process.env.VIBE_RESEARCH_STRICT_EGRESS,
    VIBE_RESEARCH_ALLOWED_ORIGIN: process.env.VIBE_RESEARCH_ALLOWED_ORIGIN,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.VIBE_RESEARCH_ALLOWED_ORIGIN;
    assert.throws(() => validateBaseUrl('https://vibe-research.example.com'),
      /ALLOWED_ORIGIN_REQUIRED/);

    process.env.VIBE_RESEARCH_ALLOWED_ORIGIN = 'https://vibe-research.example.com';
    assert.equal(validateBaseUrl('https://vibe-research.example.com').origin,
      'https://vibe-research.example.com');
    assert.throws(() => validateBaseUrl('https://different.example.com'),
      /ORIGIN_NOT_ALLOWED/);
    assert.throws(() => validateBaseUrl('http://127.0.0.1:8899'),
      /INVALID_VIBE_RESEARCH_BASE_URL/);
    assert.throws(() => validateBaseUrl('https://metadata.internal'),
      /ORIGIN_NOT_ALLOWED/);
    assert.throws(() => validateBaseUrl('https://127.0.0.1'),
      /ORIGIN_NOT_ALLOWED/);
    assert.throws(() => validateBaseUrl('https://vibe-research.example.com/other'),
      /INVALID_VIBE_RESEARCH_BASE_URL/);
    process.env.VIBE_RESEARCH_ALLOWED_ORIGIN = 'https://vibe-research.example.com/path';
    assert.throws(() => validateBaseUrl('https://vibe-research.example.com'),
      /ORIGIN_NOT_ALLOWED/);

    process.env.NODE_ENV = 'test';
    process.env.VIBE_RESEARCH_STRICT_EGRESS = 'true';
    process.env.VIBE_RESEARCH_ALLOWED_ORIGIN = 'https://vibe-research.example.com';
    assert.equal(validateBaseUrl('https://vibe-research.example.com').hostname,
      'vibe-research.example.com');
    assert.throws(() => validateBaseUrl('http://localhost:8899'),
      /ORIGIN_NOT_ALLOWED/);
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
