const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && payload.error
      ? payload.error
      : 'Request failed';
    throw new Error(message);
  }

  return payload;
}

export { API_BASE_URL, apiUrl, requestJson };
