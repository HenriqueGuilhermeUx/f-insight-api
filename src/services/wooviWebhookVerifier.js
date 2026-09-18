'use strict';

const crypto = require('crypto');
const axios = require('axios');

const WOOVI_BASE_URL = (process.env.WOOVI_BASE_URL || 'https://api.woovi.com').replace(/\/$/, '');
const PUBLIC_KEYS_URL = `${WOOVI_BASE_URL}/api/v1/webhook/public-keys`;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cachedKeys = [];
let cachedAt = 0;

async function getPublicKeys() {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - cachedAt < CACHE_TTL_MS) return cachedKeys;

  try {
    const response = await axios.get(PUBLIC_KEYS_URL, { timeout: 5000 });
    const entries = Array.isArray(response.data?.public_keys) ? response.data.public_keys : [];
    const keys = entries.map((entry) => entry?.key).filter(Boolean);
    if (keys.length === 0) throw new Error('Woovi public key response was empty');
    cachedKeys = keys;
    cachedAt = now;
    return cachedKeys;
  } catch (error) {
    if (cachedKeys.length > 0) {
      console.warn('Woovi public key refresh failed; using cached keys:', error.message);
      return cachedKeys;
    }
    throw error;
  }
}

async function verifyWooviWebhook({ rawBody, signature }) {
  if (!rawBody || !signature) return false;

  const keys = await getPublicKeys();
  return keys.some((publicKey) => {
    try {
      const verifier = crypto.createVerify('sha256');
      verifier.write(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody));
      verifier.end();
      return verifier.verify(publicKey, String(signature), 'base64');
    } catch {
      return false;
    }
  });
}

module.exports = {
  verifyWooviWebhook,
  getPublicKeys,
};
