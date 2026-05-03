# Tables View

Source: `pos_frontend/src/pages/TablesPage.jsx`

## What it does
- Displays all tables, grouped by area when available.
- Shows whether each table is free or occupied.
- Shows the open order total and assigned staff for occupied tables.
- Allows users to open an existing order or start a new order for a table.

## Role conditions
- There is no frontend role gating in this screen.
- Any logged-in user who can access the app can click on a table.

## Table behavior
- Clicking a free table navigates to `POSPage` with a new order for that table.
- Clicking an occupied table opens the existing open order for that table.
- The page refreshes automatically every 15 seconds.

## Notes
- If no tables exist, the screen prompts the user to sync from server or add tables from admin.
