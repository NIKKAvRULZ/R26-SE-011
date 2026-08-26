const crypto = require('node:crypto');

let bcrypt = null;
try {
  // Prefer bcryptjs when installed.
  // eslint-disable-next-line global-require
  bcrypt = require('bcryptjs');
} catch (_error) {
  bcrypt = null;
}

function parseBcryptRounds(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 8 || parsed > 14) {
    return fallback;
  }
  return parsed;
}

function scryptHash(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(String(password), salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`$scrypt$${salt}$${Buffer.from(key).toString('hex')}`);
    });
  });
}

function scryptVerify(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[1] !== 'scrypt') {
      resolve(false);
      return;
    }

    const salt = parts[2];
    const expectedHex = parts[3];

    crypto.scrypt(String(password), salt, 64, (error, key) => {
      if (error) {
        resolve(false);
        return;
      }

      const expected = Buffer.from(expectedHex, 'hex');
      const actual = Buffer.from(key);
      if (expected.length !== actual.length) {
        resolve(false);
        return;
      }

      resolve(crypto.timingSafeEqual(expected, actual));
    });
  });
}

async function hashPassword(password, rounds) {
  if (bcrypt) {
    return bcrypt.hash(String(password), parseBcryptRounds(rounds));
  }

  return scryptHash(password);
}

async function comparePassword(password, storedHash) {
  const value = String(storedHash || '');

  if (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')) {
    if (!bcrypt) return false;
    return bcrypt.compare(String(password), value);
  }

  if (value.startsWith('$scrypt$')) {
    return scryptVerify(password, value);
  }

  return false;
}

module.exports = {
  hashPassword,
  comparePassword,
};
