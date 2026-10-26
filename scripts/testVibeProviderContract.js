'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const source = readFileSync(process.env.VIBE_PINNED_CONTRACT_FILE || '', 'utf8');
const path = 'HKUDS/Vibe-Trading @ 3910bad3c9197de6c1fc6f28a3925ee8729c1a65';

test('pinned Vibe API source exposes only expected authenticated read contracts', () => {
  for (const route of ['/alpha/list', '/alpha/readiness', '/alpha/{alpha_id}']) {
    const declaration = '@app.get("' + route + '", dependencies=[Depends(require_auth)])';
    assert.ok(source.includes(declaration), path + ' missing authenticated GET ' + route);
  }
  for (const method of [
    'async def list_alphas(', 'async def alpha_readiness(', 'async def get_alpha(',
  ]) assert.ok(source.includes(method), path + ' missing ' + method);
  for (const zoo of ['alpha101', 'gtja191', 'qlib158', 'academic', 'fundamental']) {
    assert.ok(source.includes('"' + zoo + '"'), 'missing supported zoo: ' + zoo);
  }
  assert.ok(source.includes('_ALPHA_ID_RE = re.compile(r"^[a-z][a-z0-9]+_[a-z0-9_]{1,64}$")'),
    'provider changed alpha ID format');
  assert.ok(source.includes('"source_code": source_code'),
    'upstream no longer returns expected raw source field; review sanitization assumptions');
  // Static contract only: do not mistake repository source checks for a running
  // provider with real market data, availability or secure secret management.
  assert.ok(source.includes('"universe": meta.get('));
});
