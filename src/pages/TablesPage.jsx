import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import db from "../db";
import { useOffline } from "../context/OfflineContext";
import useAutoRefresh from "../hooks/useAutoRefresh";

export default function TablesPage() {
  const [tables, setTables] = useState([]);
  const [openOrders, setOpenOrders] = useState({});
  const [staffMap, setStaffMap] = useState({});
  const { triggerSync, syncing, syncVersion } = useOffline();
  const navigate = useNavigate();

  const loadTables = useCallback(async () => {
    const allTables = await db.pos_tables.toArray();
    const sortedTables = [...allTables].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
    );
    setTables(sortedTables);

    const staff = await db.staff.toArray();
    const sMap = {};
    for (const s of staff) sMap[s.id] = s.name;
    setStaffMap(sMap);

    try {
      const ordersMap = {};
      const openOrdersList = await db.orders
        .where("status")
        .anyOf(["draft", "confirmed"])
        .toArray();
      for (const order of openOrdersList) {
        if (order.table_id) {
          ordersMap[order.table_id] = order;
        }
      }
      setOpenOrders(ordersMap);
    } catch (err) {
      console.error("Failed to load orders:", err);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [syncVersion, loadTables]);

  useAutoRefresh(loadTables, 15000);

  const getTableStatus = useCallback(
    (table) => (openOrders[table.id] ? "occupied" : "free"),
    [openOrders]
  );

  const handleTableClick = useCallback(
    (table) => {
      const existingOrder = openOrders[table.id];
      if (existingOrder) {
        navigate(`/pos/${existingOrder.id}`);
      } else {
        navigate(`/pos/new?table_id=${table.id}`);
      }
    },
    [openOrders, navigate]
  );

  const statusConfig = {
    free: { bg: "#e8f5e9", border: "#4caf50", color: "#2e7d32", label: "Free" },
    occupied: { bg: "#ffebee", border: "#f44336", color: "#c62828", label: "Occupied" },
  };

  const areas = [...new Set(tables.map((t) => t.area).filter(Boolean))];
  const occupiedCount = tables.filter((t) => getTableStatus(t) === "occupied").length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Tables</h2>
        <div style={styles.stats}>
          <span style={styles.stat}>{tables.length} tables</span>
          <span style={{ ...styles.stat, color: "#c62828" }}>{occupiedCount} occupied</span>
          <span style={{ ...styles.stat, color: "#2e7d32" }}>{tables.length - occupiedCount} free</span>
        </div>
        <button style={styles.syncBtn} onClick={triggerSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      {areas.length > 0
        ? areas.map((area) => (
            <div key={area}>
              <h3 style={styles.areaTitle}>{area}</h3>
              <div style={styles.grid}>
                  {tables
                    .filter((t) => t.area === area)
                    .map((table) => renderCard(table, statusConfig, openOrders, staffMap, getTableStatus, handleTableClick))}
              </div>
            </div>
          ))
        : tables.length > 0 && (
            <div style={styles.grid}>
              {tables.map((table) => renderCard(table, statusConfig, openOrders, staffMap, getTableStatus, handleTableClick))}
            </div>
          )}

      {tables.length === 0 && (
        <div style={styles.empty}>
          <p>No tables found.</p>
          <p style={{ fontSize: 13, color: "#999" }}>Sync from server or add tables in admin.</p>
        </div>
      )}
    </div>
  );
}

function renderCard(table, statusConfig, openOrders, staffMap, getTableStatus, handleTableClick) {
  const status = getTableStatus(table);
  const config = statusConfig[status];
  const order = openOrders[table.id];
  const staffName = order?.assigned_staff_id ? staffMap[order.assigned_staff_id] : null;

  return (
    <div
      key={table.id}
      style={{ ...styles.tableCard, borderColor: config.border, background: config.bg }}
      onClick={() => handleTableClick(table)}
    >
      <div style={{ ...styles.tableName, color: config.color }}>{table.name}</div>
      <div style={{ ...styles.tableCapacity, color: config.color }}>
        {table.capacity} seats
      </div>
      <div style={{ ...styles.tableStatus, background: config.border, color: "#fff" }}>
        {config.label}
      </div>
      {order && (
        <div style={styles.orderInfo}>
          ₹{parseFloat(order.total).toFixed(0)}
        </div>
      )}
      {staffName && (
        <div style={styles.staffInfo}>{staffName}</div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 16, maxWidth: 1200, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { margin: 0, fontSize: 22 },
  stats: { display: "flex", gap: 16, fontSize: 13 },
  stat: { fontWeight: 600 },
  syncBtn: { padding: "6px 16px", borderRadius: 6, border: "1px solid #e94560", background: "#fff", color: "#e94560", cursor: "pointer", fontSize: 13 },
  areaTitle: { fontSize: 16, color: "#666", margin: "16px 0 8px", paddingBottom: 4, borderBottom: "1px solid #eee" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },
  tableCard: {
    borderRadius: 10,
    border: "2px solid",
    padding: 16,
    cursor: "pointer",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  tableName: { fontSize: 18, fontWeight: 700 },
  tableCapacity: { fontSize: 12 },
  tableStatus: { padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 },
  orderInfo: { fontSize: 14, fontWeight: 700, marginTop: 4, color: "#333" },
  staffInfo: { fontSize: 11, color: "#666", fontWeight: 500, fontStyle: "italic", marginTop: 2 },
  empty: { textAlign: "center", color: "#999", padding: 60 },
};
