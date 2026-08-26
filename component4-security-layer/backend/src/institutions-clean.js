const mongoose = require('mongoose');

const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
let modelOverride = null;

function normalizeText(value) { return String(value ?? '').trim(); }
function normalizeInstitutionId(value) { return normalizeText(value).toUpperCase(); }

function normalizeCommitment(value) {
  const normalized = normalizeText(value);
  if (!/^\d+$/.test(normalized)) return '';
  try {
    const fieldValue = BigInt(normalized);
    return fieldValue > 0n && fieldValue < FIELD_MODULUS ? fieldValue.toString() : '';
  } catch (_error) { return ''; }
}

function getInstitutionModel() {
  if (modelOverride) return modelOverride;
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB is not connected');
  return mongoose.models.Component4Institution || mongoose.model(
    'Component4Institution',
    new mongoose.Schema({
      institutionId: { type: String, unique: true, required: true },
      name: { type: String, required: true },
      label: { type: String, default: 'External Institution' },
      commitment: { type: String, unique: true, required: true },
      status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    }, { timestamps: true, versionKey: false }),
  );
}

function publicInstitution(institution) {
  if (!institution) return null;
  const value = institution.toObject ? institution.toObject() : institution;
  return { id: value.institutionId, institutionId: value.institutionId, name: value.name, institutionName: value.name, label: value.label, commitment: value.commitment };
}

async function resolveInstitution(institutionId) {
  const institution = await getInstitutionModel().findOne({ institutionId: normalizeInstitutionId(institutionId), status: 'active' }).lean();
  return publicInstitution(institution);
}

async function listInstitutions() {
  const institutions = await getInstitutionModel().find({ status: 'active' }).sort({ name: 1 }).lean();
  return institutions.map(publicInstitution);
}

async function registerInstitution({ id, name, label, commitment }) {
  const institutionId = normalizeInstitutionId(id);
  const normalizedName = normalizeText(name);
  const normalizedLabel = normalizeText(label || 'External Institution');
  const normalizedCommitment = normalizeCommitment(commitment);
  if (!institutionId || !normalizedName || !normalizedCommitment) {
    return { success: false, status: 400, error: 'Institution id, name and a valid BN254 field commitment are required' };
  }

  const Institution = getInstitutionModel();
  if (await Institution.exists({ $or: [{ institutionId }, { commitment: normalizedCommitment }] })) {
    return { success: false, status: 409, error: 'Institution or commitment already exists' };
  }
  try {
    const institution = await Institution.create({ institutionId, name: normalizedName, label: normalizedLabel, commitment: normalizedCommitment });
    return { success: true, status: 201, institution: publicInstitution(institution) };
  } catch (error) {
    if (error?.code === 11000) return { success: false, status: 409, error: 'Institution or commitment already exists' };
    throw error;
  }
}

function setInstitutionModelForTests(model) { modelOverride = model; }

module.exports = { listInstitutions, registerInstitution, resolveInstitution, setInstitutionModelForTests };
