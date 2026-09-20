const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

// Set by authContext once a user is signed in, so every mutating request
// carries a fresh Firebase ID token without each call site having to know
// about auth.
let tokenProvider = () => Promise.resolve(null);
export function setAuthTokenProvider(fn) {
  tokenProvider = fn;
}

async function request(path, options = {}) {
  const token = await tokenProvider();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  me: () => request("/me"),
  listDrinks: () => request("/drinks"),
  createDrink: (data) => request("/drinks", { method: "POST", body: JSON.stringify(data) }),
  history: (id) => request(`/drinks/${id}/history`),
  recordSale: (id) => request(`/drinks/${id}/sale`, { method: "POST" }),
  reset: (id) => request(`/drinks/${id}/reset`, { method: "POST" }),
  setPricing: (id, { listPrice, wholesalePrice }, reason) =>
    request(`/drinks/${id}/pricing`, {
      method: "PATCH",
      body: JSON.stringify({ listPrice, wholesalePrice, reason }),
    }),
  setActive: (id, active) =>
    request(`/drinks/${id}/active`, { method: "POST", body: JSON.stringify({ active }) }),
  deleteDrink: (id) => request(`/drinks/${id}`, { method: "DELETE" }),
  auditLog: (limit = 100) => request(`/audit?limit=${limit}`),
};