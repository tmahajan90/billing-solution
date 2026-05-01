import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("api_url") || import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" ? "http://localhost:3000" : window.location.origin));
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurant_name: "",
  });

  const handleSaveUrl = () => {
    const trimmed = apiUrl.replace(/\/+$/, "");
    api.setBaseUrl(trimmed);
    setShowSettings(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await register(form);
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Billing Solution</h1>
        <h2 style={styles.subtitle}>{isRegister ? "Register" : "Login"}</h2>

        {error && <div style={styles.error}>{error}</div>}

        {showSettings && (
          <div style={styles.settingsBox}>
            <label style={styles.settingsLabel}>Backend Server URL</label>
            <input style={styles.input} placeholder="https://xxxx.ngrok-free.app" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            <div style={styles.settingsActions}>
              <button style={styles.saveBtn} type="button" onClick={handleSaveUrl}>Save</button>
              <button style={styles.cancelBtn} type="button" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
            <p style={styles.hint}>Current: {api.baseUrl}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegister && (
            <>
              <input style={styles.input} placeholder="Restaurant Name" value={form.restaurant_name} onChange={update("restaurant_name")} required />
              <input style={styles.input} placeholder="Your Name" value={form.name} onChange={update("name")} required />
            </>
          )}
          <input style={styles.input} type="email" placeholder="Email" value={form.email} onChange={update("email")} required />
          <input style={styles.input} type="password" placeholder="Password" value={form.password} onChange={update("password")} required minLength={6} />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Please wait..." : isRegister ? "Register" : "Login"}
          </button>
        </form>

        <div style={styles.footerRow}>
          <p style={styles.toggle}>
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button style={styles.link} onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? "Login" : "Register"}
            </button>
          </p>
          <button style={styles.gearBtn} type="button" onClick={() => setShowSettings(!showSettings)} title="Server Settings">
            &#9881;
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#1a1a2e" },
  card: { background: "#fff", borderRadius: 12, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 4px 24px rgba(0,0,0,0.2)" },
  title: { textAlign: "center", color: "#e94560", fontSize: 28, marginBottom: 4 },
  subtitle: { textAlign: "center", color: "#666", fontSize: 18, marginBottom: 24 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: 16 },
  button: { padding: "12px", borderRadius: 8, border: "none", background: "#e94560", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" },
  error: { background: "#fee", color: "#c00", padding: 10, borderRadius: 8, marginBottom: 12, textAlign: "center" },
  toggle: { textAlign: "center", marginTop: 16, color: "#666" },
  link: { background: "none", border: "none", color: "#e94560", cursor: "pointer", fontWeight: 600, fontSize: 14 },
  footerRow: { display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 },
  gearBtn: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999", padding: 4, lineHeight: 1 },
  settingsBox: { background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 },
  settingsLabel: { fontWeight: 600, fontSize: 14, color: "#333" },
  settingsActions: { display: "flex", gap: 8 },
  saveBtn: { padding: "6px 16px", borderRadius: 6, border: "none", background: "#e94560", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  cancelBtn: { padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", color: "#666", cursor: "pointer", fontSize: 13 },
  hint: { fontSize: 11, color: "#999", margin: 0 },
};
