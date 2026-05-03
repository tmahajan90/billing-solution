# Orders Management

Source: `pos_frontend/src/pages/OrdersPage.jsx`

## What it does
- Displays a searchable order list with filters for open, draft, confirmed, completed, and cancelled orders.
- Shows sync status and online/offline state.
- Allows navigating to existing orders for editing.
- Supports closing and deleting open orders.

## Role conditions
- `staff`, `chef`, and `kitchen` are considered frontline users and can view the order list and edit orders.
- `cashier`, `manager`, and `admin` can close open orders by setting status to `completed`.
- `manager` and `admin` can delete open orders from the server and local DB.

## Notes
- The `Edit` button is available for orders with status `draft` or `confirmed`.
- Deleting an order requires an internet connection because it must delete the server record.
- Closing orders sets `sync_status` to pending and attempts a sync if online.
