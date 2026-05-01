import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { useOffline } from "../context/OfflineContext";
import { useAuth } from "../context/AuthContext";
import { SYNC_STATUS } from "../services/sync";
import useAutoRefresh from "../hooks/useAutoRefresh";

function normalizeDiscountType(raw) {
  if (raw === "percentage" || raw === 1 || raw === "1") return "percentage";
  if (raw === "flat" || raw === 2 || raw === "2") return "flat";
  return "none";
}

export default function POSPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tableId = searchParams.get("table_id");

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerDiscountApplied, setCustomerDiscountApplied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [tableName, setTableName] = useState("");
  const [selectedTableId, setSelectedTableId] = useState(tableId || null);
  const [allTables, setAllTables] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [existingOrder, setExistingOrder] = useState(null);
  const [discountType, setDiscountType] = useState("none");
  const [discountValueInput, setDiscountValueInput] = useState("");
  const { isOnline, syncVersion } = useOffline();
  const { user, tenant } = useAuth();

  const handleCustomerPhoneBlur = useCallback(async () => {
    const phone = customerPhone.trim();
    if (!phone || phone.length < 4) return;
    if (customerDiscountApplied) return;
    try {
      const { default: api } = await import("../services/api");
      const customer = await api.get(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`);
      if (!customer || customer.error) return;
      if (customer.name) setCustomerName(customer.name);
      if (customer.discount_type === "percentage" || customer.discount_type === "flat") {
        setDiscountType(customer.discount_type === "flat" ? "flat" : "percentage");
        setDiscountValueInput(String(customer.discount_value));
        setCustomerDiscountApplied(true);
      }
    } catch {
      // offline or not found
    }
  }, [customerPhone, customerDiscountApplied]);

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
  // Prefer localStorage copy because sync refresh updates it immediately.
  const tenantTax = persistedTenant?.tax_settings || tenant?.tax_settings || {};
  const cgstEnabled = toBool(tenantTax.cgst_enabled, true);
  const sgstEnabled = toBool(tenantTax.sgst_enabled, true);
  const vatEnabled = toBool(tenantTax.vat_enabled, true);
  const vatSurchargeEnabled = toBool(tenantTax.vat_surcharge_enabled, false);
  const cgstRate = Number(tenantTax.cgst_rate ?? 2.5);
  const sgstRate = Number(tenantTax.sgst_rate ?? 2.5);
  const vatRate = Number(tenantTax.vat_rate ?? 20);
  const vatSurchargeRate = Number(tenantTax.vat_surcharge_rate ?? 0);

  // Only when opening a brand-new order — not on every sync / auto-refresh (those were clearing discount).
  useEffect(() => {
    if (orderId && orderId !== "new") return;
    setExistingOrder(null);
    setDiscountType("none");
    setDiscountValueInput("");
    setCustomerDiscountApplied(false);
    if (user?.role === "staff" && user.id && selectedTableId) {
      setSelectedStaffId(user.id);
    } else {
      setSelectedStaffId(null);
    }
  }, [orderId]);

  // Auto-assign staff user when they select a table on a new order
  useEffect(() => {
    if (user?.role === "staff" && user.id && selectedTableId && !selectedStaffId) {
      setSelectedStaffId(user.id);
    }
  }, [selectedTableId, allStaff, user]);

  useEffect(() => {
    loadData();
  }, [orderId, tableId, syncVersion]);

  // Load order + cart + discount from DB only when navigating to this order — not on sync/interval refresh,
  // or unsaved discount type/value gets overwritten from stale stored discount_type.
  useEffect(() => {
    if (!orderId || orderId === "new") return;
    loadExistingOrder(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-load when route orderId changes
  }, [orderId]);

  const loadData = async () => {
    await loadProducts();
    const tables = await db.pos_tables.toArray();
    const sortedTables = [...tables].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
    );
    setAllTables(sortedTables);
    const staff = await db.staff.toArray();
    setAllStaff(staff);
    if (tableId) {
      const table = await db.pos_tables.get(tableId);
      if (table) {
        setTableName(table.name);
        setSelectedTableId(tableId);
      }
    }
  };

  useAutoRefresh(loadData, 20000);

  const loadProducts = async () => {
    let all = await db.products.toArray();
    all = all.filter((p) => p.active === true || p.active === 1);

    const seen = new Set();
    all = all.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (all.length === 0 && isOnline) {
      try {
        const { default: api } = await import("../services/api");
        const remoteProducts = await api.get("/api/products");
        await db.products.clear();
        for (const p of remoteProducts) {
          await db.products.put({ ...p, tax_type: p.tax_type || "gst" });
        }
        all = await db.products.toArray();
        all = all.filter((p) => p.active === true || p.active === 1);
      } catch {
        // offline fallback
      }
    }

    setProducts(all);
  };

  const CATEGORY_PRIORITY = ["Beverages", "Starters", "Main Course", "Breads", "Rice", "Desserts", "Other"];
  const normalizeCategory = (value) => (value || "Other").toString().trim();
  const categoryRank = (value) => {
    const idx = CATEGORY_PRIORITY.findIndex((entry) => entry.toLowerCase() === normalizeCategory(value).toLowerCase());
    return idx === -1 ? CATEGORY_PRIORITY.length : idx;
  };
  const compareProductByTypeThenName = (a, b) => {
    const rankDiff = categoryRank(a.category) - categoryRank(b.category);
    if (rankDiff !== 0) return rankDiff;
    const categoryDiff = normalizeCategory(a.category).localeCompare(normalizeCategory(b.category), undefined, { sensitivity: "base" });
    if (categoryDiff !== 0) return categoryDiff;
    return (a.name || "").localeCompare((b.name || ""), undefined, { numeric: true, sensitivity: "base" });
  };

  const findOrderById = async (id) => {
    let order = await db.orders.get(id);
    if (order) return order;

    const numericId = Number(id);
    if (!Number.isNaN(numericId)) {
      order = await db.orders.get(numericId);
      if (order) return order;
    }

    const allOrders = await db.orders.toArray();
    return allOrders.find((o) => String(o.id) === String(id)) || null;
  };

  const loadExistingOrder = async (id) => {
    const order = await findOrderById(id);
    if (!order) return;

    setExistingOrder(order);
    setCustomerName(order.customer_name || "");
    setCustomerPhone(order.customer_phone || "");
    const dType = normalizeDiscountType(order.discount_type);
    setDiscountType(dType);
    setDiscountValueInput(dType === "none" || order.discount_value == null ? "" : String(order.discount_value));
    setSelectedStaffId(user?.role === "staff" && user.id ? user.id : (order.assigned_staff_id || null));

    if (order.table_id) {
      setSelectedTableId(order.table_id);
      const table = await db.pos_tables.get(order.table_id);
      if (table) setTableName(table.name);
    }

    const items = await db.order_items.where("order_id").equals(order.id).toArray();
    const productMap = {};
    const productTaxMap = {};
    const allProducts = await db.products.toArray();
    for (const p of allProducts) {
      productMap[p.id] = p.name;
      productTaxMap[p.id] = p.tax_type || "gst";
    }

    const cartItems = items.map((item) => ({
      product_id: item.product_id,
      name: item.name || productMap[item.product_id] || "Unknown",
      unit_price: item.unit_price,
      quantity: item.quantity,
      total: item.total,
      tax_type: productTaxMap[item.product_id] || "gst",
    }));
    setCart(cartItems);
  };

  const sortedProducts = [...products].sort(compareProductByTypeThenName);
  const categorySet = new Set(sortedProducts.map((p) => normalizeCategory(p.category)));
  const orderedCategories = Array.from(categorySet).sort((a, b) => {
    const rankDiff = categoryRank(a) - categoryRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  const categories = ["All", ...orderedCategories];
  const filtered = selectedCategory === "All"
    ? sortedProducts
    : sortedProducts.filter((p) => normalizeCategory(p.category) === selectedCategory);
  const groupedProducts = filtered.reduce((acc, product) => {
    const category = normalizeCategory(product.category);
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {});

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit_price: parseFloat(product.price),
          quantity: 1,
          total: parseFloat(product.price),
          tax_type: product.tax_type || "gst",
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product_id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta), total: Math.max(0, item.quantity + delta) * item.unit_price }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const gstItems = cart.filter((item) => (item.tax_type || "gst") === "gst");
  const vatItems = cart.filter((item) => item.tax_type === "vat");
  const gstSubtotal = gstItems.reduce((sum, item) => sum + item.total, 0);
  const vatSubtotal = vatItems.reduce((sum, item) => sum + item.total, 0);
  const subtotal = gstSubtotal + vatSubtotal;
  const cgstTaxAmount = cgstEnabled ? (gstSubtotal * cgstRate) / 100 : 0;
  const sgstTaxAmount = sgstEnabled ? (gstSubtotal * sgstRate) / 100 : 0;
  const gstTaxAmount = cgstTaxAmount + sgstTaxAmount;
  const vatTaxAmount = vatEnabled ? (vatSubtotal * vatRate) / 100 : 0;
  const vatSurchargeAmount = vatSurchargeEnabled ? (vatTaxAmount * vatSurchargeRate) / 100 : 0;
  const totalBeforeDiscount =
    Math.round((subtotal + cgstTaxAmount + sgstTaxAmount + vatTaxAmount + vatSurchargeAmount) * 100) / 100;
  const rawDiscountParam = parseFloat(String(discountValueInput).replace(",", ".")) || 0;
  let discountAmount = 0;
  if (discountType === "percentage" && rawDiscountParam > 0) {
    discountAmount = Math.min(totalBeforeDiscount, (totalBeforeDiscount * rawDiscountParam) / 100);
  } else if (discountType === "flat" && rawDiscountParam > 0) {
    discountAmount = Math.min(totalBeforeDiscount, rawDiscountParam);
  }
  discountAmount = Math.round(discountAmount * 100) / 100;
  const exactPayable = Math.max(0, Math.round((totalBeforeDiscount - discountAmount) * 100) / 100);
  const roundedTotal = Math.max(0, Math.round(exactPayable));
  const roundOffAmount = Math.round((roundedTotal - exactPayable) * 100) / 100;
  const grandTotal = roundedTotal;
  const exitPath = orderId === "new" ? (selectedTableId ? "/tables" : "/orders") : "/tables";

  const placeOrder = async () => {
    if (cart.length === 0) return;
    if (selectedTableId && !selectedStaffId) {
      alert("Please assign a staff member when a table is selected.");
      return;
    }

    const now = new Date().toISOString();

    if (existingOrder) {
      await db.order_items.where("order_id").equals(existingOrder.id).delete();

      for (const item of cart) {
        await db.order_items.put({
          id: uuidv4(),
          order_id: existingOrder.id,
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        });
      }

      await db.orders.update(existingOrder.id, {
        table_id: selectedTableId || null,
        assigned_staff_id: selectedTableId ? (selectedStaffId || null) : null,
        total: grandTotal,
        subtotal,
        gst_enabled: cgstEnabled || sgstEnabled,
        gst_rate: cgstRate + sgstRate,
        gst_amount: gstTaxAmount,
        cgst_enabled: cgstEnabled,
        cgst_rate: cgstRate,
        cgst_amount: cgstTaxAmount,
        sgst_enabled: sgstEnabled,
        sgst_rate: sgstRate,
        sgst_amount: sgstTaxAmount,
        vat_enabled: vatEnabled,
        vat_rate: vatRate,
        vat_amount: vatTaxAmount,
        vat_surcharge_enabled: vatSurchargeEnabled,
        vat_surcharge_rate: vatSurchargeRate,
        vat_surcharge_amount: vatSurchargeAmount,
        discount_type: discountType,
        discount_value: discountType === "none" ? 0 : rawDiscountParam,
        discount_amount: discountAmount,
        round_off_amount: roundOffAmount,
        customer_name: customerName || "Walk-in",
        customer_phone: customerPhone,
        status: "confirmed",
        sync_status: SYNC_STATUS.PENDING,
        updated_at: now,
        version: (existingOrder.version || 1) + 1,
      });
    } else {
      const newOrderId = uuidv4();

      const order = {
        id: newOrderId,
        table_id: selectedTableId || null,
        assigned_staff_id: selectedTableId ? (selectedStaffId || null) : null,
        status: "confirmed",
        sync_status: SYNC_STATUS.PENDING,
        total: grandTotal,
        subtotal,
        gst_enabled: cgstEnabled || sgstEnabled,
        gst_rate: cgstRate + sgstRate,
        gst_amount: gstTaxAmount,
        cgst_enabled: cgstEnabled,
        cgst_rate: cgstRate,
        cgst_amount: cgstTaxAmount,
        sgst_enabled: sgstEnabled,
        sgst_rate: sgstRate,
        sgst_amount: sgstTaxAmount,
        vat_enabled: vatEnabled,
        vat_rate: vatRate,
        vat_amount: vatTaxAmount,
        vat_surcharge_enabled: vatSurchargeEnabled,
        vat_surcharge_rate: vatSurchargeRate,
        vat_surcharge_amount: vatSurchargeAmount,
        discount_type: discountType,
        discount_value: discountType === "none" ? 0 : rawDiscountParam,
        discount_amount: discountAmount,
        round_off_amount: roundOffAmount,
        customer_name: customerName || "Walk-in",
        customer_phone: customerPhone,
        version: 1,
        created_at: now,
        updated_at: now,
      };

      await db.orders.put(order);

      for (const item of cart) {
        await db.order_items.put({
          id: uuidv4(),
          order_id: newOrderId,
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        });
      }
    }

    if (isOnline) {
      try {
        const { syncService } = await import("../services/sync");
        await syncService.pushPendingOrders();
      } catch {
        // Will sync later
      }
    }

    navigate(exitPath);
  };

  const closeOrder = async () => {
    if (!existingOrder) return;
    await db.orders.update(existingOrder.id, {
      status: "completed",
      sync_status: SYNC_STATUS.PENDING,
      updated_at: new Date().toISOString(),
    });
    if (isOnline) {
      try {
        const { syncService } = await import("../services/sync");
        await syncService.pushPendingOrders();
      } catch {
        // Will sync later
      }
    }
    navigate("/tables");
  };

  return (
    <div style={styles.container}>
      <div style={styles.productsPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Menu</h2>
          {tableName && <span style={styles.tableBadge}>Table: {tableName}{selectedStaffId && ` · ${allStaff.find((s) => s.id === selectedStaffId)?.name || ""}`}</span>}
        </div>
        <div style={styles.categories}>
          {categories.map((cat) => (
            <button key={cat} style={{ ...styles.catBtn, ...(selectedCategory === cat ? styles.catBtnActive : {}) }} onClick={() => setSelectedCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>
        <div style={styles.productGrid}>
          {selectedCategory === "All" && orderedCategories.map((category) => (
            groupedProducts[category]?.length ? (
              <div key={`section-${category}`} style={styles.categorySection}>
                <div style={styles.categorySectionTitle}>{category}</div>
                <div style={styles.categorySectionGrid}>
                  {groupedProducts[category].map((product) => (
                    <div key={product.id} style={styles.productCard} onClick={() => addToCart(product)}>
                      <div style={styles.productName}>{product.name}</div>
                      <div style={styles.productCategory}>{normalizeCategory(product.category)}</div>
                      <div style={styles.productPrice}>₹{parseFloat(product.price).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          ))}
          {selectedCategory !== "All" && filtered.map((product) => (
            <div key={product.id} style={styles.productCard} onClick={() => addToCart(product)}>
              <div style={styles.productName}>{product.name}</div>
              <div style={styles.productCategory}>{normalizeCategory(product.category)}</div>
              <div style={styles.productPrice}>₹{parseFloat(product.price).toFixed(2)}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={styles.empty}>No products available. Pull to sync from server.</div>}
        </div>
      </div>

      <div style={styles.cartPanel}>
        <h2 style={styles.panelTitle}>
          {existingOrder ? `Order #${existingOrder.id.slice(0, 8).toUpperCase()}` : "Cart"} ({cart.length})
        </h2>

        <div style={styles.customerInputs}>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={{ ...styles.selectTable, flex: 1 }}
              value={selectedTableId || ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedTableId(id);
                const t = allTables.find((tbl) => tbl.id === id);
                setTableName(t ? t.name : "");
                if (id && user?.role === "staff" && user.id) {
                  setSelectedStaffId(user.id);
                }
              }}
            >
              <option value="">No Table</option>
              {allTables.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.area || "No Area"}, {t.capacity} seats)</option>
              ))}
            </select>
            <select
              style={{ ...styles.selectTable, flex: 1, opacity: selectedTableId ? 1 : 0.5 }}
              value={selectedStaffId || ""}
              onChange={(e) => setSelectedStaffId(e.target.value || null)}
              disabled={!selectedTableId || user?.role === "staff"}
            >
              <option value="">Assign Staff *</option>
              {allStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...styles.input, flex: 1 }} placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input style={{ ...styles.input, flex: 1 }} placeholder="Phone (optional)" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setCustomerDiscountApplied(false); }} onBlur={handleCustomerPhoneBlur} />
          </div>
        </div>

        <div style={styles.cartItems}>
          {gstItems.length > 0 && <div style={styles.taxSectionTitle}>GST Items</div>}
          {gstItems.map((item) => (
            <div key={item.product_id} style={styles.cartItem}>
              <div style={styles.cartItemInfo}>
                <div style={styles.cartItemName}>{item.name}</div>
                <div style={styles.cartItemPrice}>₹{item.unit_price.toFixed(2)} x {item.quantity}</div>
              </div>
              <div style={styles.cartItemActions}>
                <button style={styles.qtyBtn} onClick={() => updateQuantity(item.product_id, -1)}>-</button>
                <span style={styles.qty}>{item.quantity}</span>
                <button style={styles.qtyBtn} onClick={() => updateQuantity(item.product_id, 1)}>+</button>
                <button style={styles.removeBtn} onClick={() => removeFromCart(item.product_id)}>x</button>
              </div>
              <div style={styles.cartItemTotal}>₹{item.total.toFixed(2)}</div>
            </div>
          ))}
          {vatItems.length > 0 && <div style={styles.taxSectionTitle}>VAT Items</div>}
          {vatItems.map((item) => (
            <div key={item.product_id} style={styles.cartItem}>
              <div style={styles.cartItemInfo}>
                <div style={styles.cartItemName}>{item.name}</div>
                <div style={styles.cartItemPrice}>₹{item.unit_price.toFixed(2)} x {item.quantity}</div>
              </div>
              <div style={styles.cartItemActions}>
                <button style={styles.qtyBtn} onClick={() => updateQuantity(item.product_id, -1)}>-</button>
                <span style={styles.qty}>{item.quantity}</span>
                <button style={styles.qtyBtn} onClick={() => updateQuantity(item.product_id, 1)}>+</button>
                <button style={styles.removeBtn} onClick={() => removeFromCart(item.product_id)}>x</button>
              </div>
              <div style={styles.cartItemTotal}>₹{item.total.toFixed(2)}</div>
            </div>
          ))}
          {cart.length === 0 && <div style={styles.emptyCart}>Cart is empty. Tap products to add.</div>}
        </div>

        <div style={styles.cartFooter}>
          <div style={styles.subtotalSummaryRow}>
            <span>Subtotal:</span>
            <span style={styles.subtotalSummaryAmount}>₹{subtotal.toFixed(2)}</span>
          </div>
          <div style={styles.taxRow}>
            <span>CGST ({cgstRate.toFixed(2)}%):</span>
            <span>₹{cgstTaxAmount.toFixed(2)}</span>
          </div>
          <div style={styles.taxRow}>
            <span>SGST ({sgstRate.toFixed(2)}%):</span>
            <span>₹{sgstTaxAmount.toFixed(2)}</span>
          </div>
          <div style={styles.taxRow}>
            <span>VAT ({vatRate.toFixed(2)}%):</span>
            <span>₹{vatTaxAmount.toFixed(2)}</span>
          </div>
          <div style={styles.taxRow}>
            <span>VAT Surcharge ({vatSurchargeRate.toFixed(2)}% on VAT):</span>
            <span>₹{vatSurchargeAmount.toFixed(2)}</span>
          </div>
          <div style={styles.discountSectionWrap}>
            <div style={styles.discountBlock}>
              <div style={styles.discountHeaderLine}>
                <span style={styles.discountSectionTitle}>Discount</span>
                <span style={styles.discountHintInline}>After tax — reduces the final total</span>
              </div>
              <div style={styles.discountFieldsRow}>
                <select
                  style={styles.selectDiscount}
                  value={discountType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDiscountType(v);
                    setDiscountValueInput("");
                  }}
                >
                  <option value="none">No discount</option>
                  <option value="percentage">Percentage</option>
                  <option value="flat">Fixed ₹</option>
                </select>
                {discountType !== "none" && (
                  <input
                    style={styles.inputDiscountInline}
                    type="number"
                    min="0"
                    step="0.01"
                    max={discountType === "percentage" ? "100" : undefined}
                    inputMode="decimal"
                    placeholder={discountType === "percentage" ? "%" : "₹"}
                    value={discountValueInput}
                    onChange={(e) => setDiscountValueInput(e.target.value)}
                  />
                )}
              </div>
              {discountAmount > 0 && (
                <div style={styles.discountAppliedRow}>
                  <span>
                    Off bill
                    {discountType === "percentage" && discountValueInput ? ` (${discountValueInput}%)` : ""}
                    {customerDiscountApplied && <span style={styles.customerDiscountBadge}>Customer</span>}
                  </span>
                  <span style={styles.discountAppliedAmt}>−₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          {roundOffAmount !== 0 && (
            <div style={styles.taxRow}>
              <span>Round off:</span>
              <span>
                {roundOffAmount > 0 ? "+" : "−"}₹{Math.abs(roundOffAmount).toFixed(2)}
              </span>
            </div>
          )}
          <div style={styles.totalRow}>
            <span>Total:</span>
            <span style={styles.totalAmount}>₹{grandTotal.toFixed(2)}</span>
          </div>
          <div style={styles.btnRow}>
            <button style={{ ...styles.placeOrderBtn, ...(cart.length === 0 ? styles.disabled : {}) }} onClick={placeOrder} disabled={cart.length === 0}>
              {existingOrder ? "Update Order" : "Place Order"}
              {!isOnline && <span style={styles.offlineHint}> (Offline)</span>}
            </button>
            {existingOrder && user?.role !== "staff" && (
              <button type="button" style={styles.closeBtn} onClick={closeOrder}>
                Close Order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: "flex", gap: 16, padding: 16, height: "calc(100vh - 60px)", overflow: "hidden" },
  productsPanel: { flex: 2, display: "flex", flexDirection: "column", gap: 12 },
  panelHeader: { display: "flex", alignItems: "center", gap: 12 },
  tableBadge: { background: "#1a1a2e", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600 },
  cartPanel: { flex: 1, background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: 480, minWidth: 380 },
  panelTitle: { margin: "0 0 8px", fontSize: 18, color: "#333" },
  categories: { display: "flex", gap: 8, flexWrap: "wrap" },
  catBtn: { padding: "6px 16px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 },
  catBtnActive: { background: "#e94560", color: "#fff", borderColor: "#e94560" },
  productGrid: { display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1, padding: "4px 0" },
  categorySection: { display: "flex", flexDirection: "column", gap: 8 },
  categorySectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#666",
    borderBottom: "1px solid #eee",
    paddingBottom: 4,
  },
  categorySectionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 },
  productCard: { background: "#fff", borderRadius: 10, padding: 16, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "transform 0.15s", border: "1px solid #eee" },
  productName: { fontWeight: 600, fontSize: 14, marginBottom: 4, color: "#333" },
  productCategory: { fontSize: 12, color: "#999", marginBottom: 8 },
  productPrice: { fontSize: 16, fontWeight: 700, color: "#e94560" },
  customerInputs: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  discountSectionWrap: { marginTop: 10 },
  discountBlock: {
    borderRadius: 10,
    padding: "12px 12px 12px 14px",
    background: "linear-gradient(180deg, #fff9fa 0%, #fdf5f6 100%)",
    border: "1px solid #f3e0e4",
    borderLeft: "4px solid #e94560",
    boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  discountHeaderLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "4px 10px",
    rowGap: 4,
  },
  discountSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#c73e54",
    flexShrink: 0,
  },
  discountHintInline: {
    fontSize: 11,
    color: "#9a8f92",
    fontWeight: 500,
    lineHeight: 1.35,
  },
  discountFieldsRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  discountAppliedRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: "#555",
    marginTop: 2,
    paddingTop: 8,
    borderTop: "1px dashed #e8cdd2",
  },
  discountAppliedAmt: { fontWeight: 700, color: "#c73e54", fontVariantNumeric: "tabular-nums" },
  customerDiscountBadge: {
    display: "inline-block",
    marginLeft: 6,
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    background: "#fce7f3",
    color: "#9d174d",
    letterSpacing: 0.3,
  },
  selectTable: {
    width: "100%",
    padding: "11px 40px 11px 14px",
    borderRadius: 8,
    border: "1px solid #dfe3e8",
    fontSize: 13,
    fontWeight: 600,
    color: "#1a1a2e",
    backgroundColor: "#fff",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231a1a2e' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px",
    boxShadow: "0 1px 3px rgba(26, 26, 46, 0.06)",
  },
  selectDiscount: {
    flex: 1,
    minWidth: 0,
    width: "auto",
    padding: "11px 40px 11px 14px",
    borderRadius: 8,
    border: "1px solid #e5c8ce",
    fontSize: 13,
    fontWeight: 600,
    color: "#4a3540",
    backgroundColor: "#fff",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23e94560' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px",
    boxShadow: "0 1px 4px rgba(233, 69, 96, 0.08)",
  },
  input: { padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 },
  inputDiscountInline: {
    flex: "0 0 96px",
    width: 96,
    minWidth: 72,
    maxWidth: 120,
    padding: "11px 10px",
    borderRadius: 8,
    border: "1px solid #e5c8ce",
    fontSize: 13,
    fontWeight: 600,
    color: "#4a3540",
    backgroundColor: "#fff",
    boxShadow: "0 1px 4px rgba(233, 69, 96, 0.06)",
    textAlign: "center",
  },
  cartItems: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 },
  taxSectionTitle: {
    marginTop: 4,
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
  cartItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0", gap: 8 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 13, fontWeight: 600 },
  cartItemPrice: { fontSize: 11, color: "#888" },
  cartItemActions: { display: "flex", alignItems: "center", gap: 4 },
  qtyBtn: { width: 24, height: 24, borderRadius: 4, border: "1px solid #ddd", background: "#f8f8f8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  qty: { fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" },
  removeBtn: { width: 24, height: 24, borderRadius: 4, border: "none", background: "#fee", color: "#e94560", cursor: "pointer", fontSize: 12 },
  cartItemTotal: { fontWeight: 600, fontSize: 13, minWidth: 60, textAlign: "right" },
  emptyCart: { color: "#999", textAlign: "center", padding: 24, fontSize: 13 },
  empty: { color: "#999", textAlign: "center", padding: 40, fontSize: 14, gridColumn: "1 / -1" },
  cartFooter: { borderTop: "2px solid #f0f0f0", paddingTop: 12, marginTop: 8 },
  subtotalSummaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    fontSize: 14,
    fontWeight: 600,
    color: "#666",
    marginBottom: 8,
  },
  subtotalSummaryAmount: { color: "#444", fontVariantNumeric: "tabular-nums" },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginBottom: 12 },
  taxRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666", marginBottom: 6 },
  totalAmount: { color: "#e94560" },
  btnRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  placeOrderBtn: {
    flex: 1,
    minWidth: 0,
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    background: "#e94560",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.3,
  },
  offlineHint: { fontSize: 11, fontWeight: 500, opacity: 0.9 },
  disabled: { opacity: 0.5, cursor: "not-allowed" },
  closeBtn: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #4caf50",
    background: "#fff",
    color: "#2e7d32",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.3,
    flexShrink: 0,
  },
};
