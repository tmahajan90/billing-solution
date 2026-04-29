import api from "./api";
import db from "../db";

const SYNC_STATUS = {
  SYNCED: "synced",
  PENDING: "pending",
  FAILED: "failed",
};

const timestampOrMin = (value) => {
  const ts = value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
};

let isSyncing = false;

export const syncService = {
  async pushPendingOrders() {
    if (isSyncing) return;
    if (!navigator.onLine) return;

    isSyncing = true;
    try {
      const pendingOrders = await db.orders
        .where("sync_status")
        .equals(SYNC_STATUS.PENDING)
        .toArray();

      if (pendingOrders.length === 0) return;

      const ordersPayload = [];

      for (const order of pendingOrders) {
        const items = await db.order_items
          .where("order_id")
          .equals(order.id)
          .toArray();

        ordersPayload.push({
          id: order.id,
          table_id: order.table_id || null,
          status: order.status,
          total: order.total,
          subtotal: order.subtotal ?? order.total ?? 0,
          gst_enabled: order.gst_enabled ?? true,
          gst_rate: order.gst_rate ?? 0,
          gst_amount: order.gst_amount ?? 0,
          cgst_enabled: order.cgst_enabled ?? true,
          cgst_rate: order.cgst_rate ?? ((order.gst_rate ?? 0) / 2),
          cgst_amount: order.cgst_amount ?? ((order.gst_amount ?? 0) / 2),
          sgst_enabled: order.sgst_enabled ?? true,
          sgst_rate: order.sgst_rate ?? ((order.gst_rate ?? 0) / 2),
          sgst_amount: order.sgst_amount ?? ((order.gst_amount ?? 0) / 2),
          vat_enabled: order.vat_enabled ?? true,
          vat_rate: order.vat_rate ?? 0,
          vat_amount: order.vat_amount ?? 0,
          vat_surcharge_enabled: order.vat_surcharge_enabled ?? false,
          vat_surcharge_rate: order.vat_surcharge_rate ?? 0,
          vat_surcharge_amount: order.vat_surcharge_amount ?? 0,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          updated_at: order.updated_at,
          order_items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
          })),
        });
      }

      const result = await api.post("/api/sync/push", { orders: ordersPayload });

      const now = new Date().toISOString();
      for (const orderId of result.pushed) {
        await db.orders.update(orderId, {
          sync_status: SYNC_STATUS.SYNCED,
          synced_at: now,
        });
      }

      return result;
    } catch (error) {
      console.error("Push sync failed:", error);
      throw error;
    } finally {
      isSyncing = false;
    }
  },

  async pullFromServer() {
    if (!navigator.onLine) return;

    const meta = await db.sync_meta.get("last_sync");
    const lastSyncedAt = meta?.value || null;

    try {
      const result = await api.get(
        `/api/sync/pull${lastSyncedAt ? `?last_synced_at=${encodeURIComponent(lastSyncedAt)}` : ""}`
      );

      const serverProducts = (result.products || []).map((product) => ({
        ...product,
        tax_type: product.tax_type || "gst",
      }));
      const serverTables = result.tables || [];
      const serverOrders = result.orders || [];
      const deletedIds = result.deleted_order_ids || [];

      await db.products.clear();
      await db.products.bulkPut(serverProducts);

      await db.pos_tables.clear();
      await db.pos_tables.bulkPut(serverTables);

      for (const order of serverOrders) {
        const existing = await db.orders.get(order.id);
        const incomingTs = timestampOrMin(order.updated_at);
        const existingTs = timestampOrMin(existing?.updated_at);
        const hasNewerLocalPending =
          existing &&
          existing.sync_status === SYNC_STATUS.PENDING &&
          existingTs > incomingTs;

        // Apply server snapshot unless local has a strictly newer pending edit.
        if (!hasNewerLocalPending && (!existing || incomingTs >= existingTs)) {
          await db.orders.put({
            id: order.id,
            tenant_id: order.tenant_id,
            user_id: order.user_id,
            table_id: order.table_id || null,
            status: order.status,
            total: parseFloat(order.total),
            subtotal: parseFloat(order.subtotal ?? order.total ?? 0),
            gst_enabled: order.gst_enabled !== false,
            gst_rate: parseFloat(order.gst_rate ?? 0),
            gst_amount: parseFloat(order.gst_amount ?? 0),
            cgst_enabled: order.cgst_enabled !== false,
            cgst_rate: parseFloat(order.cgst_rate ?? ((order.gst_rate ?? 0) / 2)),
            cgst_amount: parseFloat(order.cgst_amount ?? ((order.gst_amount ?? 0) / 2)),
            sgst_enabled: order.sgst_enabled !== false,
            sgst_rate: parseFloat(order.sgst_rate ?? ((order.gst_rate ?? 0) / 2)),
            sgst_amount: parseFloat(order.sgst_amount ?? ((order.gst_amount ?? 0) / 2)),
            vat_enabled: order.vat_enabled !== false,
            vat_rate: parseFloat(order.vat_rate ?? 0),
            vat_amount: parseFloat(order.vat_amount ?? 0),
            vat_surcharge_enabled: order.vat_surcharge_enabled === true,
            vat_surcharge_rate: parseFloat(order.vat_surcharge_rate ?? 0),
            vat_surcharge_amount: parseFloat(order.vat_surcharge_amount ?? 0),
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            version: order.version,
            sync_status: SYNC_STATUS.SYNCED,
            created_at: order.created_at,
            updated_at: order.updated_at,
          });

          if (order.order_items) {
            await db.order_items.where("order_id").equals(order.id).delete();
            for (const item of order.order_items) {
              await db.order_items.put({
                id: item.id || crypto.randomUUID(),
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                total: parseFloat(item.total),
              });
            }
          }
        }
      }

      for (const deletedId of deletedIds) {
        await db.orders.delete(deletedId);
        await db.order_items.where("order_id").equals(deletedId).delete();
      }

      if (result.tax_settings) {
        const tenantRaw = localStorage.getItem("tenant");
        if (tenantRaw) {
          const tenant = JSON.parse(tenantRaw);
          localStorage.setItem("tenant", JSON.stringify({ ...tenant, tax_settings: result.tax_settings }));
        }
      }

      await db.sync_meta.put({
        key: "last_sync",
        value: result.server_time,
      });

      return result;
    } catch (error) {
      console.error("Pull sync failed:", error);
      throw error;
    }
  },

  async fullSync() {
    await this.pullFromServer();
    await this.pushPendingOrders();
  },
};

export { SYNC_STATUS };
