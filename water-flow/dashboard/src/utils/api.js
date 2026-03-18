const API_URL = import.meta.env.VITE_API_URL || "";

export function apiFetch(path, options = {}) {
  const token = localStorage.getItem("google_id_token");
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
