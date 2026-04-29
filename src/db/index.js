import Dexie from "dexie";

const db = new Dexie("POS_DB");

db.version(3).stores({
  products: "id, name, category, price, active, updated_at",
  orders: "id, table_id, status, sync_status, updated_at, created_at",
  order_items: "id, order_id, product_id",
  pos_tables: "id, name, capacity, area",
  sync_meta: "key",
}).upgrade((tx) => {
  return tx.table("orders").toCollection().modify((order) => {
    order.table_id = order.table_id || null;
  });
});

db.version(4).stores({
  products: "id, name, category, tax_type, price, active, updated_at",
  orders: "id, table_id, status, sync_status, updated_at, created_at",
  order_items: "id, order_id, product_id",
  pos_tables: "id, name, capacity, area",
  sync_meta: "key",
}).upgrade((tx) => {
  return tx.table("products").toCollection().modify((product) => {
    product.tax_type = product.tax_type || "gst";
  });
});

export default db;
