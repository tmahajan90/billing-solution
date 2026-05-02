import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";

export default function Layout() {
  const { user, tenant, logout } = useAuth();
  const { isOnline, syncing, triggerSync, refreshData, lastSync } = useOffline();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    const handleKeydown = (event) => {
      const key = event.key?.toLowerCase();
      const isRefreshKey = key === "f5" || ((event.ctrlKey || event.metaKey) && key === "r");
      if (isRefreshKey) {
        event.preventDefault();
      }
    };

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <div style={styles.shell}>
      <nav style={styles.nav}>
        <div style={styles.navLeft}>
          <span style={styles.logo}>Billing Solution</span>
          <span style={styles.tenant}>{tenant?.name}</span>
        </div>
        <div style={styles.navCenter}>
          <NavLink to="/" end style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}>Tables</NavLink>
          <NavLink to="/pos/new" style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}>POS</NavLink>
          <NavLink to="/orders" style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}>Orders</NavLink>
          <NavLink to="/kitchen" style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}>Kitchen</NavLink>
        </div>
        <div style={styles.navRight}>
          <span style={{ ...styles.statusDot, background: isOnline ? "#4caf50" : "#f44336" }} />
          <span style={styles.statusText}>{isOnline ? "Online" : "Offline"}</span>
          {syncing && <span style={styles.syncing}>Syncing...</span>}
          <button style={styles.syncBtn} onClick={triggerSync} disabled={syncing}>Sync</button>
          <button style={styles.refreshBtn} onClick={refreshData} disabled={syncing || !isOnline}>Refresh Data</button>
          <span style={styles.userName}>{user?.name}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell: { minHeight: "100vh", background: "#f5f5f5" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, background: "#1a1a2e", color: "#fff", gap: 16 },
  navLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { fontWeight: 700, fontSize: 18, color: "#e94560" },
  tenant: { fontSize: 13, color: "#aaa" },
  navCenter: { display: "flex", gap: 4 },
  navLink: { padding: "8px 16px", borderRadius: 6, color: "#aaa", textDecoration: "none", fontSize: 14, fontWeight: 500 },
  navLinkActive: { background: "#e94560", color: "#fff" },
  navRight: { display: "flex", alignItems: "center", gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: "50%" },
  statusText: { fontSize: 12, color: "#aaa" },
  syncing: { fontSize: 12, color: "#ff9800" },
  syncBtn: { padding: "4px 12px", borderRadius: 4, border: "1px solid #555", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 12 },
  refreshBtn: { padding: "4px 12px", borderRadius: 4, border: "1px solid #e94560", background: "#e94560", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  userName: { fontSize: 13, color: "#ccc" },
  logoutBtn: { padding: "4px 12px", borderRadius: 4, border: "1px solid #e94560", background: "transparent", color: "#e94560", cursor: "pointer", fontSize: 12 },
  main: { padding: 0 },
};
