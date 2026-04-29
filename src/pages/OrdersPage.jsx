import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import db from "../db";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { SYNC_STATUS, syncService } from "../services/sync";
import api from "../services/api";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const { tenant } = useAuth();
  const { isOnline, syncing, triggerSync, syncVersion } = useOffline();
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, [filter, syncVersion]);

  const loadOrders = useCallback(async () => {
    let query = db.orders.orderBy("created_at").reverse();
    let all = await query.toArray();
    const openCount = all.filter((o) => o.status === "draft" || o.status === "confirmed").length;
    setOpenOrdersCount(openCount);

    if (filter === "open") {
      all = all.filter((o) => o.status === "draft" || o.status === "confirmed");
    } else if (filter !== "all") {
      all = all.filter((o) => o.status === filter);
    }

    const productMap = {};
    const productTaxMap = {};
    const allProducts = await db.products.toArray();
    for (const p of allProducts) {
      productMap[p.id] = p.name;
      productTaxMap[p.id] = p.tax_type || "gst";
    }

    const tableMap = {};
    const allTables = await db.pos_tables.toArray();
    for (const t of allTables) {
      tableMap[t.id] = t.name;
    }

    const persistedTenant = (() => {
      try {
        const raw = localStorage.getItem("tenant");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();
    const toBool = (value, defaultValue = true) => {
      if (value === undefined || value === null) return defaultValue;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    };
    const tenantTax = persistedTenant?.tax_settings || tenant?.tax_settings || {};
    const cgstRate = Number(tenantTax.cgst_rate ?? 2.5);
    const sgstRate = Number(tenantTax.sgst_rate ?? 2.5);
    const vatRate = Number(tenantTax.vat_rate ?? 20);
    const vatSurchargeRate = Number(tenantTax.vat_surcharge_rate ?? 0);
    const cgstEnabled = toBool(tenantTax.cgst_enabled, true);
    const sgstEnabled = toBool(tenantTax.sgst_enabled, true);
    const vatEnabled = toBool(tenantTax.vat_enabled, true);
    const vatSurchargeEnabled = toBool(tenantTax.vat_surcharge_enabled, false);

    const enriched = [];
    for (const order of all) {
      const items = await db.order_items.where("order_id").equals(order.id).toArray();
      const itemsWithNames = items.map((item) => ({
        ...item,
        name: item.name || productMap[item.product_id] || `Product #${item.product_id?.slice(0, 6)}`,
        tax_type: productTaxMap[item.product_id] || "gst",
      }));
      const gstItems = itemsWithNames.filter((item) => (item.tax_type || "gst") === "gst");
      const vatItems = itemsWithNames.filter((item) => item.tax_type === "vat");
      const gstSubtotal = gstItems.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
      const vatSubtotal = vatItems.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);

      const computedSubtotal = gstSubtotal + vatSubtotal;
      const hasSnapshot = order.subtotal != null || order.cgst_amount != null || order.sgst_amount != null || order.vat_amount != null || order.vat_surcharge_amount != null;
      const subtotal = hasSnapshot ? parseFloat(order.subtotal ?? computedSubtotal) : computedSubtotal;
      const cgstTax = hasSnapshot ? parseFloat(order.cgst_amount ?? ((parseFloat(order.gst_amount ?? 0)) / 2)) : (cgstEnabled ? (gstSubtotal * cgstRate) / 100 : 0);
      const sgstTax = hasSnapshot ? parseFloat(order.sgst_amount ?? ((parseFloat(order.gst_amount ?? 0)) / 2)) : (sgstEnabled ? (gstSubtotal * sgstRate) / 100 : 0);
      const gstTax = cgstTax + sgstTax;
      const vatTax = hasSnapshot ? parseFloat(order.vat_amount ?? 0) : (vatEnabled ? (vatSubtotal * vatRate) / 100 : 0);
      const vatSurchargeTax = hasSnapshot ? parseFloat(order.vat_surcharge_amount ?? 0) : (vatSurchargeEnabled ? (vatTax * vatSurchargeRate) / 100 : 0);
      const snapCgstRate = hasSnapshot ? Number(order.cgst_rate ?? ((Number(order.gst_rate ?? (cgstRate + sgstRate))) / 2)) : cgstRate;
      const snapSgstRate = hasSnapshot ? Number(order.sgst_rate ?? ((Number(order.gst_rate ?? (cgstRate + sgstRate))) / 2)) : sgstRate;
      const snapVatRate = hasSnapshot ? Number(order.vat_rate ?? vatRate) : vatRate;
      const snapVatSurchargeRate = hasSnapshot ? Number(order.vat_surcharge_rate ?? vatSurchargeRate) : vatSurchargeRate;
      const grandTotal = parseFloat(order.total ?? (subtotal + gstTax + vatTax + vatSurchargeTax));

      enriched.push({
        ...order,
        items: itemsWithNames,
        gst_items: gstItems,
        vat_items: vatItems,
        cgst_rate: snapCgstRate,
        sgst_rate: snapSgstRate,
        vat_rate: snapVatRate,
        vat_surcharge_rate: snapVatSurchargeRate,
        subtotal,
        cgst_tax: cgstTax,
        sgst_tax: sgstTax,
        gst_tax: gstTax,
        vat_tax: vatTax,
        vat_surcharge_tax: vatSurchargeTax,
        grand_total: grandTotal,
        table_name: order.table_id ? (tableMap[order.table_id] || null) : null,
      });
    }

    setOrders(enriched);
  }, [filter, tenant]);

  useAutoRefresh(loadOrders, 15000);

  const handleEditOrder = useCallback(
    (orderId) => {
      navigate(`/pos/${orderId}`);
    },
    [navigate]
  );

  const handleCloseOrder = useCallback(
    async (orderId) => {
      await db.orders.update(orderId, {
        status: "completed",
        sync_status: SYNC_STATUS.PENDING,
        updated_at: new Date().toISOString(),
      });

      if (isOnline) {
        try {
          await syncService.pushPendingOrders();
        } catch {
          // keep pending for next sync attempt
        }
      }

      await loadOrders();
    },
    [isOnline, loadOrders]
  );

  const handleDeleteOrder = useCallback(
    async (order) => {
      if (!window.confirm("Delete this open order? This action cannot be undone.")) return;

      if (!isOnline) {
        window.alert("Order deletion requires internet connection so server and device stay in sync.");
        return;
      }

      try {
        await api.delete(`/api/orders/${order.id}`);
      } catch (error) {
        window.alert(error.message || "Failed to delete order on server.");
        return;
      }

      await db.orders.delete(order.id);
      await db.order_items.where("order_id").equals(order.id).delete();
      await loadOrders();
    },
    [isOnline, loadOrders]
  );

  const statusColors = {
    draft: "#999",
    confirmed: "#2196f3",
    completed: "#4caf50",
    cancelled: "#f44336",
  };

  const syncColors = {
    synced: "#4caf50",
    pending: "#ff9800",
    failed: "#f44336",
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Orders</h2>
        <div style={styles.actions}>
          <span style={{ ...styles.badge, background: isOnline ? "#e8f5e9" : "#ffebee", color: isOnline ? "#2e7d32" : "#c62828" }}>
            {isOnline ? "Online" : "Offline"}
          </span>
          <button style={styles.syncBtn} onClick={triggerSync} disabled={syncing || !isOnline}>
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>

      <div style={styles.filters}>
        {["all", "open", "draft", "confirmed", "completed", "cancelled"].map((f) => (
          <button key={f} style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }} onClick={() => setFilter(f)}>
            {f === "open"
              ? `Open (${openOrdersCount})`
              : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.orderList}>
        {orders.length === 0 && <div style={styles.empty}>No orders found</div>}
        {orders.map((order) => (
          <div key={order.id} style={styles.orderCard}>
            <div style={styles.orderHeader}>
              <div>
                <span style={styles.orderId}>{order.id.slice(0, 8).toUpperCase()}</span>
                <span style={{ ...styles.statusBadge, background: statusColors[order.status] || "#999", color: "#fff" }}>
                  {order.status}
                </span>
                {order.sync_status && (
                  <span style={{ ...styles.syncBadge, background: syncColors[order.sync_status] || "#999", color: "#fff" }}>
                    {order.sync_status}
                  </span>
                )}
              </div>
              <div style={styles.orderDate}>{new Date(order.created_at).toLocaleString()}</div>
            </div>
            <div style={styles.orderBody}>
              <div style={styles.customerInfo}>
                {order.table_name && <span style={styles.tableTag}>Table: {order.table_name}</span>}
                {order.customer_name}
                {order.customer_phone && <span style={styles.phone}> - {order.customer_phone}</span>}
              </div>
              <div style={styles.orderItems}>
                {(order.gst_items || []).length > 0 && <div style={styles.taxSectionTitle}>GST Items</div>}
                {(order.gst_items || []).map((item, i) => (
                  <div key={`gst-${i}`} style={styles.orderItem}>
                    <span>{item.name || `Product #${item.product_id?.slice(0, 6)}`}</span>
                    <span>x{item.quantity} ₹{parseFloat(item.total).toFixed(2)}</span>
                  </div>
                ))}
                {(order.vat_items || []).length > 0 && <div style={styles.taxSectionTitle}>VAT Items</div>}
                {(order.vat_items || []).map((item, i) => (
                  <div key={`vat-${i}`} style={styles.orderItem}>
                    <span>{item.name || `Product #${item.product_id?.slice(0, 6)}`}</span>
                    <span>x{item.quantity} ₹{parseFloat(item.total).toFixed(2)}</span>
                  </div>
                ))}
                <div style={styles.billBreakup}>
                  <div style={styles.billTotalRow}>
                    <span>Subtotal:</span>
                    <span style={styles.billSubtotalAmount}>₹{order.subtotal.toFixed(2)}</span>
                  </div>
                  <div style={styles.billTaxRow}><span>CGST ({order.cgst_rate.toFixed(2)}%):</span><span>₹{order.cgst_tax.toFixed(2)}</span></div>
                  <div style={styles.billTaxRow}><span>SGST ({order.sgst_rate.toFixed(2)}%):</span><span>₹{order.sgst_tax.toFixed(2)}</span></div>
                  <div style={styles.billTaxRow}><span>VAT ({order.vat_rate.toFixed(2)}%):</span><span>₹{order.vat_tax.toFixed(2)}</span></div>
                  <div style={styles.billTaxRow}><span>VAT Surcharge ({order.vat_surcharge_rate.toFixed(2)}% on VAT):</span><span>₹{order.vat_surcharge_tax.toFixed(2)}</span></div>
                  <div style={styles.billTotalRow}>
                    <span>Total:</span>
                    <span style={styles.billTotalAmount}>₹{order.grand_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={styles.orderFooter}>
              {(order.status === "draft" || order.status === "confirmed") && (
                <div style={styles.footerActions}>
                  <button style={styles.editBtn} onClick={() => handleEditOrder(order.id)}>
                    Edit
                  </button>
                  <button style={styles.closeBtn} onClick={() => handleCloseOrder(order.id)}>
                    Close
                  </button>
                  <button style={styles.deleteBtn} onClick={() => handleDeleteOrder(order)}>
                    Delete
                  </button>
                </div>
              )}
              <span style={styles.orderTotal}>Total: ₹{order.grand_total.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 16, maxWidth: 900, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 22, color: "#333" },
  actions: { display: "flex", gap: 8, alignItems: "center" },
  badge: { padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  syncBtn: { padding: "6px 16px", borderRadius: 6, border: "1px solid #e94560", background: "#fff", color: "#e94560", cursor: "pointer", fontSize: 13 },
  filters: { display: "flex", gap: 8, marginBottom: 16 },
  filterBtn: { padding: "6px 16px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 },
  filterBtnActive: { background: "#e94560", color: "#fff", borderColor: "#e94560" },
  orderList: { display: "flex", flexDirection: "column", gap: 12 },
  empty: { textAlign: "center", color: "#999", padding: 40 },
  orderCard: { background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  orderHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  orderId: { fontWeight: 700, fontSize: 14, marginRight: 8 },
  statusBadge: { padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, marginRight: 4 },
  syncBadge: { padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600 },
  orderDate: { fontSize: 12, color: "#888" },
  orderBody: { marginBottom: 8 },
  customerInfo: { fontSize: 13, color: "#555", marginBottom: 6 },
  tableTag: { background: "#1a1a2e", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, marginRight: 8 },
  phone: { color: "#888" },
  orderItems: { display: "flex", flexDirection: "column", gap: 2 },
  taxSectionTitle: {
    marginTop: 6,
    marginBottom: 2,
    padding: "4px 8px",
    borderRadius: 6,
    background: "#f5f5f5",
    color: "#555",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  orderItem: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", padding: "2px 0" },
  billBreakup: {
    marginTop: 8,
    borderTop: "2px solid #f0f0f0",
    paddingTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  billTaxRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" },
  billTotalRow: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, marginTop: 2 },
  billSubtotalAmount: { color: "#333" },
  billTotalAmount: { color: "#e94560" },
  orderFooter: {
    borderTop: "1px solid #f0f0f0",
    paddingTop: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  footerActions: { display: "flex", gap: 8 },
  editBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#333",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  closeBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #4caf50",
    background: "#fff",
    color: "#2e7d32",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  deleteBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #dc2626",
    background: "#fff",
    color: "#b91c1c",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  orderTotal: { fontWeight: 700, fontSize: 16, color: "#e94560" },
};
