/**
 * API utility for making authenticated requests to the backend.
 * Handles token refresh automatically on 401 responses.
 */

const API_BASE = "https://rimmed-expire-childhood.ngrok-free.dev/api";
/**
 * Get stored auth tokens from localStorage.
 */
function getTokens() {
  if (typeof window === 'undefined') return {};
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

/**
 * Store auth tokens in localStorage.
 */
function setTokens(accessToken, refreshToken) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

/**
 * Clear stored auth tokens.
 */
function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

/**
 * Attempt to refresh the access token using the refresh token.
 */
async function refreshAccessToken() {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    setTokens(data.accessToken, null);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Make an authenticated API request.
 * Automatically retries with a refreshed token on 401.
 */
async function apiFetch(endpoint, options = {}) {
  const { accessToken } = getTokens();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // If 401, try refreshing the token
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, message: data.error || 'Request failed' };
  }

  return data;
}

/**
 * Auth-specific API calls
 */
const authAPI = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (userData) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  logout: () => {
    const { refreshToken } = getTokens();
    clearTokens();
    return apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {}); // Fire and forget
  },

  getProfile: () => apiFetch('/auth/me'),
};

export { apiFetch, authAPI, getTokens, setTokens, clearTokens, API_BASE };
