import api from "./api";

export const authService = {
  async register(data) {
    const result = await api.post("/api/auth/register", { auth: data });
    localStorage.setItem("auth_token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    localStorage.setItem("tenant", JSON.stringify(result.tenant));
    return result;
  },

  async login(data) {
    const result = await api.post("/api/auth/login", { auth: data });
    localStorage.setItem("auth_token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    localStorage.setItem("tenant", JSON.stringify(result.tenant));
    return result;
  },

  logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    localStorage.removeItem("tenant");
  },

  getUser() {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  },

  getTenant() {
    const raw = localStorage.getItem("tenant");
    return raw ? JSON.parse(raw) : null;
  },

  isLoggedIn() {
    return !!localStorage.getItem("auth_token");
  },
};
