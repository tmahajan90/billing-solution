const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

class ApiClient {
  constructor() {
    this.baseUrl = localStorage.getItem("api_url") || DEFAULT_API_URL;
  }

  setBaseUrl(url) {
    this.baseUrl = url;
    localStorage.setItem("api_url", url);
  }

  getToken() {
    return localStorage.getItem("auth_token");
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(this.getToken() && { Authorization: `Bearer ${this.getToken()}` }),
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.errors?.join(", ") || `HTTP ${response.status}`);
    }

    return response.json();
  }

  get(endpoint) {
    return this.request(endpoint);
  }

  post(endpoint, body) {
    return this.request(endpoint, { method: "POST", body: JSON.stringify(body) });
  }

  patch(endpoint, body) {
    return this.request(endpoint, { method: "PATCH", body: JSON.stringify(body) });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: "DELETE" });
  }
}

export default new ApiClient();
