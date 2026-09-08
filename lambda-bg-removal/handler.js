'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { removeBackground } = require('@imgly/background-removal-node');

const distDir = path.dirname(require.resolve('@imgly/background-removal-node'));

const config = {
  publicPath: pathToFileURL(distDir).href + '/',
  model: 'medium',
  output: { format: 'image/png', quality: 1, type: 'foreground' }
};

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let warmed = null;
function warmup() {
  if (!warmed) {
    warmed = removeBackground(new Blob([TINY_PNG], { type: 'image/png' }), config).catch(function (err) {
      warmed = null;
      throw err;
    });
  }
  return warmed;
}

warmup().catch(function () {});

function looksLikeImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  return false;
}

function readBody(event) {
  const raw = event.body;
  if (raw == null || raw === '') return Buffer.alloc(0);
  if (Buffer.isBuffer(raw)) return raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.image === 'string') {
          return Buffer.from(parsed.image, 'base64');
        }
      } catch (err) { /* fall through */ }
    }
  }

  const b64 = event.isBase64Encoded === true || event.isBase64Encoded === 'true';
  const candidates = [];
  if (b64) candidates.push(Buffer.from(raw, 'base64'));
  if (typeof raw === 'string') {
    candidates.push(Buffer.from(raw, 'latin1'));
    if (!b64) candidates.push(Buffer.from(raw, 'base64'));
  } else {
    candidates.push(Buffer.from(raw));
  }

  for (let i = 0; i < candidates.length; i++) {
    if (looksLikeImage(candidates[i])) return candidates[i];
  }
  return candidates[0] || Buffer.alloc(0);
}

exports.handler = async function (event) {
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method)
    || event.httpMethod
    || 'POST';

  if (method === 'OPTIONS') {
    return { statusCode: 204 };
  }
  if (method !== 'POST') {
    return { statusCode: 405, body: 'POST an image' };
  }

  const token = process.env.BG_REMOVE_TOKEN;
  if (token) {
    const headers = event.headers || {};
    const got = headers.authorization || headers.Authorization || '';
    if (got !== 'Bearer ' + token) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  const input = readBody(event);
  if (!input.length) {
    return { statusCode: 400, body: 'Empty body' };
  }
  if (input.length > 5.5 * 1024 * 1024) {
    return { statusCode: 413, body: 'Image too large (max ~5MB)' };
  }
  if (!looksLikeImage(input)) {
    return { statusCode: 400, body: 'Send a JPEG, PNG, or WebP image' };
  }

  try {
    await warmup();
    const typed = new Blob([input], { type: 'application/octet-stream' });
    const blob = await removeBackground(typed, config);
    const out = Buffer.from(await blob.arrayBuffer());
    return {
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: out.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: (err && err.message) || 'Background removal failed'
    };
  }
};
