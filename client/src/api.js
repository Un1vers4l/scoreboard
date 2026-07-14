async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith("/auth")) {
    // Session expired mid-use: tell the app shell to show the login screen.
    window.dispatchEvent(new Event("auth-expired"));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  auth: {
    status: () => request("/auth/status"),
    setup: (body) => request("/auth/setup", { method: "POST", body }),
    login: (body) => request("/auth/login", { method: "POST", body }),
    logout: () => request("/auth/logout", { method: "POST" }),
    register: (body) => request("/auth/register", { method: "POST", body }),
    changePassword: (body) => request("/auth/password", { method: "POST", body }),
    invites: {
      list: () => request("/auth/invites"),
      create: () => request("/auth/invites", { method: "POST" }),
    },
  },
  players: {
    list: () => request("/players"),
    create: (body) => request("/players", { method: "POST", body }),
    update: (id, body) => request(`/players/${id}`, { method: "PUT", body }),
    remove: (id) => request(`/players/${id}`, { method: "DELETE" }),
  },
  templates: {
    list: () => request("/templates"),
    create: (body) => request("/templates", { method: "POST", body }),
    remove: (id) => request(`/templates/${id}`, { method: "DELETE" }),
  },
  games: {
    list: (status) => request(`/games${status ? `?status=${status}` : ""}`),
    get: (id) => request(`/games/${id}`),
    create: (body) => request("/games", { method: "POST", body }),
    remove: (id) => request(`/games/${id}`, { method: "DELETE" }),
    addRound: (id, scores) => request(`/games/${id}/rounds`, { method: "POST", body: { scores } }),
    addScore: (id, playerId, value) =>
      request(`/games/${id}/scores`, { method: "POST", body: { playerId, value } }),
    editRound: (id, round, scores) =>
      request(`/games/${id}/rounds/${round}`, { method: "PUT", body: { scores } }),
    finish: (id) => request(`/games/${id}/finish`, { method: "POST" }),
  },
  stats: () => request("/stats"),
};
