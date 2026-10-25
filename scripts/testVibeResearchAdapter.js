'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { listAlphas, alphaMetadata, validateBaseUrl } = require('../src/services/vibeResearchAdapter');

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
        text: async () => '{"alphas":[]}',
      };
    },
  });
  assert.deepEqual(result, { alphas: [] });
  assert.equal(new URL(requests[0].url).pathname, '/alpha/list');
  assert.equal(requests[0].args.method, 'GET');
  assert.equal(requests[0].args.redirect, 'error');
});

test('rejects path manipulation and code execution verbs', async () => {
  assert.throws(() => alphaMetadata('../settings/llm', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
  assert.throws(() => alphaMetadata('research?x=1', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
  assert.throws(() => alphaMetadata('..', {baseUrl:'http://localhost:8899'}), /INVALID_ALPHA_ID/);
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
