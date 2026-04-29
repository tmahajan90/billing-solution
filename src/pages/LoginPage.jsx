import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurant_name: "",
  });

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
        <h1 style={styles.title}>Petpooja POS</h1>
        <h2 style={styles.subtitle}>{isRegister ? "Register" : "Login"}</h2>

        {error && <div style={styles.error}>{error}</div>}

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

        <p style={styles.toggle}>
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button style={styles.link} onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Login" : "Register"}
          </button>
        </p>
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
};
