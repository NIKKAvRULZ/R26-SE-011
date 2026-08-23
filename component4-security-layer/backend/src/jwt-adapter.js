const crypto = require('node:crypto');

let jwt = null;
try {
  // Prefer jsonwebtoken when installed.
  // eslint-disable-next-line global-require
  jwt = require('jsonwebtoken');
} catch (_error) {
  jwt = null;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const text = String(value || '').trim();
  const match = /^(\d+)([smhd])$/i.exec(text);
  if (!match) return 900;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    default:
      return 900;
  }
}

function constantTimeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

function sign(payload, secret, options = {}) {
  if (jwt) {
    return jwt.sign(payload, secret, options);
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = parseDurationSeconds(options.expiresIn || '15m');

  const completePayload = {
    ...payload,
    iat: now,
    exp: now + ttl,
    ...(options.issuer ? { iss: options.issuer } : {}),
    ...(options.audience ? { aud: options.audience } : {}),
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', String(secret))
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

function verify(token, secret, options = {}) {
  if (jwt) {
    return jwt.verify(token, secret, options);
  }

  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('invalid token');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto
    .createHmac('sha256', String(secret))
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (!constantTimeEqual(signaturePart, expectedSignature)) {
    throw new Error('invalid signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && now >= payload.exp) {
    throw new Error('jwt expired');
  }

  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error('invalid issuer');
  }

  if (options.audience && payload.aud !== options.audience) {
    throw new Error('invalid audience');
  }

  return payload;
}

function decode(token) {
  if (jwt) {
    return jwt.decode(token);
  }

  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (_error) {
    return null;
  }
}

module.exports = {
  sign,
  verify,
  decode,
};
