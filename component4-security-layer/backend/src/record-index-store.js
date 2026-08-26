const fs = require('node:fs');
const path = require('node:path');

const STORE_PATH = path.resolve(__dirname, '..', 'data', 'record-index.json');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeId(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeRoot(value) {
  return normalizeText(value).toLowerCase().replace(/^0x/, '');
}

function normalizeCid(value) {
  return normalizeText(value);
}

function normalizeVersion(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
}

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return { entries: [] };
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch (_error) {
    return { entries: [] };
  }
}

function persistStore(store) {
  ensureStoreDir();
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: store.entries,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function entryKey(candidateId, moduleCode, version) {
  return `${candidateId}::${moduleCode}::${version}`;
}

function upsertRecordIndex({ records, merkleRoot, ipfsCID, anchoredAt }) {
  const normalizedRoot = normalizeRoot(merkleRoot);
  const normalizedCid = normalizeCid(ipfsCID);

  if (!normalizedRoot || !Array.isArray(records) || records.length === 0) {
    return { updated: 0, total: 0 };
  }

  const store = loadStore();
  const map = new Map();

  for (const entry of store.entries) {
    const candidateId = normalizeId(entry.candidateId);
    const moduleCode = normalizeId(entry.moduleCode);
    const version = normalizeVersion(entry.version);
    map.set(entryKey(candidateId, moduleCode, version), {
      candidateId,
      moduleCode,
      version,
      merkleRoot: normalizeRoot(entry.merkleRoot),
      ipfsCID: normalizeCid(entry.ipfsCID),
      anchoredAt: entry.anchoredAt || null,
      indexedAt: entry.indexedAt || null,
    });
  }

  let updated = 0;

  for (const record of records) {
    const candidateId = normalizeId(record.candidateId);
    const moduleCode = normalizeId(record.moduleCode);
    const version = normalizeVersion(record.version);

    if (!candidateId || !moduleCode) {
      continue;
    }

    map.set(entryKey(candidateId, moduleCode, version), {
      candidateId,
      moduleCode,
      version,
      merkleRoot: normalizedRoot,
      ipfsCID: normalizedCid,
      anchoredAt: anchoredAt || null,
      indexedAt: new Date().toISOString(),
    });
    updated += 1;
  }

  store.entries = Array.from(map.values());
  persistStore(store);

  return { updated, total: store.entries.length };
}

function findRecordIndexEntry({ candidateId, moduleCode, version }) {
  const normalizedCandidateId = normalizeId(candidateId);
  const normalizedModuleCode = normalizeId(moduleCode);

  if (!normalizedCandidateId || !normalizedModuleCode) {
    return null;
  }

  const store = loadStore();
  const candidates = store.entries.filter(
    (entry) =>
      normalizeId(entry.candidateId) === normalizedCandidateId &&
      normalizeId(entry.moduleCode) === normalizedModuleCode,
  );

  if (candidates.length === 0) {
    return null;
  }

  if (version != null && version !== '') {
    const normalizedVersion = normalizeVersion(version);
    const exact = candidates.find((entry) => normalizeVersion(entry.version) === normalizedVersion);
    return exact || null;
  }

  candidates.sort((a, b) => normalizeVersion(b.version) - normalizeVersion(a.version));
  return candidates[0] || null;
}

module.exports = {
  upsertRecordIndex,
  findRecordIndexEntry,
};
