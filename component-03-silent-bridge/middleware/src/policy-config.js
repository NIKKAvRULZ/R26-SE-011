const axios = require('axios');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../system-config.json');
const defaultPolicy = {
    timeUnit: 'days',
    standardUploadWindow: 7,
    boeReviewWindow: 14,
    specialConcernsWindow: 21
};

function normalizePolicy(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Policy must be a JSON object.');
    }

    const policy = {
        timeUnit: value.timeUnit,
        standardUploadWindow: Number(value.standardUploadWindow),
        boeReviewWindow: Number(value.boeReviewWindow),
        specialConcernsWindow: Number(value.specialConcernsWindow)
    };

    if (!['days', 'minutes'].includes(policy.timeUnit)) {
        throw new Error('Time unit must be either days or minutes.');
    }

    if (Object.values(policy).slice(1).some(window => !Number.isFinite(window) || window <= 0)) {
        throw new Error('All policy windows must be positive numbers.');
    }

    if (!(policy.standardUploadWindow < policy.boeReviewWindow &&
          policy.boeReviewWindow < policy.specialConcernsWindow)) {
        throw new Error('Policy windows must increase from standard upload to BOE review to special concerns.');
    }

    return policy;
}

function getPolicyConfig() {
    if (!fs.existsSync(configPath)) {
        return { ...defaultPolicy };
    }
    return normalizePolicy(JSON.parse(fs.readFileSync(configPath, 'utf8')));
}

function savePolicyConfig(policy) {
    const normalizedPolicy = normalizePolicy(policy);
    fs.writeFileSync(configPath, JSON.stringify(normalizedPolicy, null, 2));
    return normalizedPolicy;
}

async function syncPolicyToComponent2(policy) {
    const baseUrl = process.env.COMPONENT_2_BASE_URL || process.env.COMPONENT_2_URL || 'http://localhost:5001';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/policy`;

    const response = await axios.put(endpoint, policy, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
    });

    return response.data;
}

module.exports = {
    getPolicyConfig,
    normalizePolicy,
    savePolicyConfig,
    syncPolicyToComponent2
};
