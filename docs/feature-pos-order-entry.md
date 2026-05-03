# POS Order Entry

Source: `pos_frontend/src/pages/POSPage.jsx`

## What it does
- Lets users build a cart from products and create or update a POS order.
- Supports table assignment, customer details, discounts, and tax calculations.
- Saves orders locally and syncs pending changes to the server when online.

## Role conditions
- `staff`, `chef`, and `kitchen` are treated as frontline users.
- Frontline users:
  - Automatically get assigned as staff when selecting a table for a new order.
  - Cannot manually change the `Assign Staff` dropdown when a table is selected.
  - Cannot change discount type or discount value.
- Non-frontline users may assign staff and edit discounts.
- Any user can add products to the cart and place or update an order.
- Only `cashier`, `manager`, and `admin` can close an existing order using the "Close Order" button.

## Important behavior
- The order form may default a selected table when navigation includes `table_id`.
- The cart button is disabled until there is at least one product in the cart.
- Offline mode is supported: orders can be placed while offline and sync later.
