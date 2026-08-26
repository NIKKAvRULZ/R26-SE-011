"use strict";

const crypto = require("crypto");

const sessions = new Map();

function cleanupExpiredSessions(now = Date.now()) {
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function createSession(institution, ttlSeconds) {
  cleanupExpiredSessions();

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + ttlSeconds * 1000;

  sessions.set(token, {
    institutionId: institution.institutionId,
    institutionName: institution.institutionName,
    expiresAt,
  });

  return {
    token,
    expiresAt,
    institutionId: institution.institutionId,
    institutionName: institution.institutionName,
  };
}

function getSession(token) {
  cleanupExpiredSessions();
  return sessions.get(token) || null;
}

function revokeSession(token) {
  return sessions.delete(token);
}

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireSession(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.sessionToken = token;
  req.session = session;
  return next();
}

module.exports = {
  createSession,
  extractBearerToken,
  getSession,
  requireSession,
  revokeSession,
};