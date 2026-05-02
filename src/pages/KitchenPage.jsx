import { useState, useEffect, useCallback } from "react";
import db from "../db";
import { useOffline } from "../context/OfflineContext";
import { useAuth } from "../context/AuthContext";
import useAutoRefresh from "../hooks/useAutoRefresh";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [staffMap, setStaffMap] = useState({});
  const [tableMap, setTableMap] = useState({});
  const [productMap, setProductMap] = useState({});
  const { isOnline, triggerSync, syncing } = useOffline();
  const { user } = useAuth();

  const loadKitchen = useCallback(async () => {
    const allOrders = await db.orders
      .where("status")
      .anyOf(["draft", "confirmed"])
      .toArray();

    const items = await db.order_items.toArray();
    const itemsByOrder = {};
    for (const item of items) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    const staff = await db.staff.toArray();
    const sMap = {};
    for (const s of staff) sMap[s.id] = s.name;
    setStaffMap(sMap);

    const tables = await db.pos_tables.toArray();
    const tMap = {};
    for (const t of tables) tMap[t.id] = t.name;
    setTableMap(tMap);

    const products = await db.products.toArray();
    const pMap = {};
    for (const p of products) pMap[p.id] = p.name;
    setProductMap(pMap);

    const enriched = allOrders
      .map((o) => ({
        ...o,
        items: (itemsByOrder[o.id] || []).map((item) => ({
          ...item,
          product_name: item.name || pMap[item.product_id] || "Unknown",
        })),
      }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    setOrders(enriched);
  }, []);

  useEffect(() => {
    loadKitchen();
  }, [loadKitchen]);

  useAutoRefresh(loadKitchen, 8000);

  const markPreparing = async (orderId) => {
    await db.orders.update(orderId, {
      status: "confirmed",
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    });
    if (isOnline) {
      try {
        const { syncService } = await import("../services/sync");
        await syncService.pushPendingOrders();
      } catch {}
    }
    loadKitchen();
  };

  const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Kitchen Display</h1>
          <span style={styles.subtitle}>{orders.length} orders · {totalItems} items</span>
        </div>
        <div style={styles.headerRight}>
          <span style={{ ...styles.dot, background: isOnline ? "#4caf50" : "#f44336" }} />
          <span style={styles.statusText}>{timeStr}</span>
          <button style={styles.syncBtn} onClick={triggerSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {orders.length === 0 && (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>✓</div>
          <div style={styles.emptyText}>No pending orders</div>
          <div style={styles.emptySub}>All caught up!</div>
        </div>
      )}

      <div style={styles.grid}>
        {orders.map((order) => {
          const age = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
          const urgent = age >= 15;
          return (
            <div key={order.id} style={{ ...styles.ticket, borderLeftColor: urgent ? "#f44336" : "#6366f1" }}>
              <div style={styles.ticketHeader}>
                <div>
                  <span style={styles.ticketId}>#{order.id.slice(0, 8).toUpperCase()}</span>
                  {order.table_id && tableMap[order.table_id] && (
                    <span style={styles.tableBadge}>{tableMap[order.table_id]}</span>
                  )}
                </div>
                <div style={styles.ticketMeta}>
                  <span style={{ ...styles.ageBadge, background: urgent ? "#ffebee" : "#e8f5e9", color: urgent ? "#c62828" : "#2e7d32" }}>
                    {age}m ago
                  </span>
                  {order.assigned_staff_id && staffMap[order.assigned_staff_id] && (
                    <span style={styles.staffBadge}>{staffMap[order.assigned_staff_id]}</span>
                  )}
                </div>
              </div>

              <div style={styles.itemsList}>
                {order.items.map((item, idx) => (
                  <div key={item.id || idx} style={styles.itemRow}>
                    <span style={styles.itemQty}>{item.quantity}×</span>
                    <span style={styles.itemName}>{item.product_name}</span>
                  </div>
                ))}
              </div>

              <div style={styles.ticketFooter}>
                <span style={styles.itemCount}>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                <span style={styles.ticketTime}>
                  {new Date(order.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 16, maxWidth: 1600, margin: "0 auto", minHeight: "100vh", background: "#0f172a" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerLeft: { display: "flex", alignItems: "baseline", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  title: { color: "#f1f5f9", margin: 0, fontSize: 24 },
  subtitle: { color: "#94a3b8", fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  statusText: { color: "#94a3b8", fontSize: 13, fontWeight: 600 },
  syncBtn: { padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  ticket: {
    background: "#1e293b",
    borderRadius: 12,
    borderLeft: "5px solid #6366f1",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  ticketHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ticketId: { color: "#f1f5f9", fontWeight: 700, fontSize: 15, fontFamily: "monospace" },
  tableBadge: { marginLeft: 8, background: "#334155", color: "#f1f5f9", padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 },
  ticketMeta: { display: "flex", alignItems: "center", gap: 6 },
  ageBadge: { padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 },
  staffBadge: { padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#1e1b4b", color: "#a5b4fc" },
  itemsList: { display: "flex", flexDirection: "column", gap: 6 },
  itemRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #334155" },
  itemQty: { color: "#f59e0b", fontWeight: 700, fontSize: 16, minWidth: 30 },
  itemName: { color: "#e2e8f0", fontSize: 14, fontWeight: 500 },
  ticketFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 12, paddingTop: 4 },
  itemCount: { fontWeight: 600 },
  ticketTime: { fontWeight: 500 },
  empty: { textAlign: "center", padding: 80, color: "#64748b" },
  emptyIcon: { fontSize: 48, color: "#22c55e", marginBottom: 12 },
  emptyText: { fontSize: 20, fontWeight: 600, color: "#94a3b8" },
  emptySub: { fontSize: 14, marginTop: 4 },
};
