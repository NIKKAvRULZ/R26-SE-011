const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeInstitutionId(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeCommitment(value) {
  return normalizeText(value).toLowerCase().replace(/^0x/, '');
}

const STORE_PATH = path.resolve(__dirname, '..', 'data', 'institutions.json');
let institutions = [];

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function persistStore() {
  ensureStoreDir();
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        institutions,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    institutions = [];
    return;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.institutions) ? parsed.institutions : [];

    institutions = entries
      .map((entry) => ({
        id: normalizeInstitutionId(entry.id),
        name: normalizeText(entry.name),
        label: normalizeText(entry.label || 'External Institution'),
        commitment: normalizeCommitment(entry.commitment),
      }))
      .filter((entry) => entry.id && entry.name && /^[a-f0-9]{64}$/i.test(entry.commitment));
  } catch (_error) {
    institutions = [];
  }
}

loadStore();

async function resolveInstitution(institutionId) {
  const normalizedId = normalizeInstitutionId(institutionId);
  const institution = institutions.find((entry) => entry.id === normalizedId);

  if (!institution) {
    return null;
  }

  return {
    id: institution.id,
    institutionId: institution.id,
    name: institution.name,
    institutionName: institution.name,
    label: institution.label,
    commitment: institution.commitment,
  };
}

async function listInstitutions() {
  return institutions.map((institution) => ({
    id: institution.id,
    institutionId: institution.id,
    name: institution.name,
    institutionName: institution.name,
    label: institution.label,
    commitment: institution.commitment,
  }));
}

function registerInstitution({ id, name, label, commitment }) {
  const normalizedId = normalizeInstitutionId(id);
  const normalizedName = normalizeText(name);
  const normalizedLabel = normalizeText(label || 'External Institution');
  const normalizedCommitment = normalizeCommitment(commitment);

  if (!normalizedId || !normalizedName || !/^[a-f0-9]{64}$/i.test(normalizedCommitment)) {
    return {
      success: false,
      status: 400,
      error: 'Institution id, name and a 64-hex-character commitment are required',
    };
  }

  const existingById = institutions.find((entry) => entry.id === normalizedId);
  if (existingById) {
    return { success: false, status: 409, error: 'Institution already exists' };
  }

  institutions.push({
    id: normalizedId,
    name: normalizedName,
    label: normalizedLabel,
    commitment: normalizedCommitment,
  });
  persistStore();

  return {
    success: true,
    status: 201,
    institution: {
      id: normalizedId,
      name: normalizedName,
      label: normalizedLabel,
      commitment: normalizedCommitment,
    },
  };
}

module.exports = {
  listInstitutions,
  registerInstitution,
  resolveInstitution,
};
