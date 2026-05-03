# Kitchen Display

Source: `pos_frontend/src/pages/KitchenPage.jsx`

## What it does
- Shows kitchen orders and their `kitchen_status` progress.
- Displays order age, table, staff assignment, items list, and current kitchen stage.
- Allows updating kitchen status through the workflow: `Pending → Cooking → Ready → Served`.

## Role conditions
- All logged-in users can view kitchen orders and order status.
- Users with role `staff` can view kitchen status but cannot advance it.
- All other users can update the kitchen status by clicking the action button.

## Kitchen workflow
- `pending` → `Start Cooking`
- `cooking` → `Mark Ready`
- `ready` → `Mark Served`
- `served` is final and has no action button

## Notes
- Kitchen status updates set `sync_status` to pending and trigger sync if online.
- The page auto-refreshes every 8 seconds to keep the display current.
