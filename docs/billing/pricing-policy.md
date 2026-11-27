# ArchTime Pricing Policy (v1 + follow-up audit)

Status: **v1 in force**. Items marked **PO DECISION** have not been decided by the Product Owner. The code keeps today's behaviour for them and does not assume an answer.

## 1. Plans and prices (defaults, stored in `BillingSettings`)

| Item | Value |
|---|---|
| Free (personal) | Free-plan limits and credits from settings |
| Pro (personal) | Monthly or yearly price from settings |
| Free organization | 3 members, 300 AI credits per month |
| Team | 59,000 VND per seat per month, or 590,000 VND per seat per year. 1,500 credits per seat per month. Minimum 1 seat. |
| Top-up | 49,000 VND per 1,000 credits. Top-up credits never expire and are used after the monthly credits. |

- One credit is worth `creditUnitUsd` (0.002 USD) of model cost and is charged in whole credits.
- Monthly credits follow the calendar month in Asia/Ho_Chi_Minh (UTC+7), including on yearly plans.

### Where prices live
- The catalogue is stored in the database (`billingsettings`).
- At startup the server creates the document with the defaults **only if none exists**. It never overwrites stored prices.
- Only system administrators can change prices, through `PUT /api/admin/billing/settings`. Each save is validated and increments `version`.
- Every order stores `catalogVersion` (the catalogue version it was priced with) and its own `amountVnd`.
- Historical orders are never recalculated.
- The FE shows only the prices the server returns (`GET /api/billing/pricing`, `/overview`, `/quote`).
- The server ignores any amount sent by a client.

## 2. Rounding and proration
- Prorated charges are rounded **up** to the next 1,000 VND, with a minimum of 1,000 VND.
- Seats added mid-period cost: `seats × seat price of the period × days left ÷ actual days of that period`.
  - "Actual days" means 28–31 for a month and 365 or 366 for a year.
  - Days left are whole days, rounded up.
- Seats added mid-month also get prorated credits for the current month, and the full 1,500 per seat from the next month.
- Lowering seats takes effect at the next renewal (`nextSeats`, or `pendingSeats` on an early renewal). The period already paid is not changed.

## 3. Current period model
- An account stores `plan`, `seats`, `validUntil` and `period`.
- `period` is the period of the **latest** purchase.
- Buying while a plan runs extends it from `validUntil`.
- So "1 year, then 1 month bought early" is stored as one end date with `period = month`. With `seatProration = latest-period` (the default), a seat added during the yearly part is priced at the monthly rate over the days of the last month only.

## 4. Segment model (implemented; pricing use behind a policy switch)
Each paid plan order now also records a **segment** on the account:

```
BillingSegment { start, end, period, seats, unitVnd /* price per seat actually paid */, orderId }
```

- Segments that have ended are dropped.
- A new plan after an ended one starts a new list.
- Seat additions do not create segments; they extend the seats of the current one.
- `BillingSettings.seatProration` selects the pricing rule:
  - `latest-period` (**default, today's behaviour**): see section 3.
  - `per-segment`: the add-seats price is the sum over the remaining segments of `unitVnd × days left in segment ÷ days of segment`, rounded once at the end. The quote breakdown lists each segment.
- Accounts created before this change have no segments. They always use `latest-period`, whatever the setting.

**PO DECISION 1 — mixed annual/monthly periods.** Choose one:
- (a) keep `latest-period`;
- (b) use `per-segment`;
- (c) another conversion rule. This would be a new `seatProration` value; none has been implemented.

Until the PO decides, the setting stays `latest-period`.

## 5. Free → Team mid-month credit
- **Today:** buying Team gives the full `seats × 1,500` credits for the current month, even when bought late in the month. A new plan resets `cycleAdjust`.
- **PO DECISION 2 — proposal, not implemented:** for the month of the upgrade, add only `(1,500 − 300) × days left ÷ days of the month` on top of the 300 Free credits.
  - Example: 10 days left in a 30-day month gives 300 + 400.
  - The rule could reuse `cycleAdjust` for the month of the upgrade.

## 6. Seats and invitations
- Seats taken = active members + invitations that have not expired. Pending invitations hold a seat.
- An invitation **reserves** a seat under a per-organization seat lock (`seatlocks`, a lease of 10 s). Only one reservation runs at a time per organization.
  - When two invitations race for one free seat, exactly one succeeds. The other gets `402 PLAN_LIMIT_REACHED` ("no seat is free").
- What happens to the reserved seat:
  - Accepting turns the reserved seat into an occupied one.
  - Declining, withdrawing or expiring releases it.
- Invitations expire after `ORG_INVITATION_TTL_DAYS` days (default 7, the same as project invitations).
  - An expired invitation is not listed, cannot be accepted, and holds no seat.
  - Its record is removed the next time someone answers it or re-invites the person.

## 7. Refunds (unchanged)
- No refunds (LI-10).
- Removing a member or lowering seats is never refunded automatically.
- Payment records are kept as they are.

## 8. Migration impact
- New optional fields:
  - `SpaceAccount.segments`;
  - `BillingOrder.catalogVersion`;
  - `BillingSettings.seatProration` (default `latest-period`) and `BillingSettings.version` (default 1);
  - a new `seatlocks` collection.
- No data is rewritten, reset or deleted.
- Existing accounts get segments from their next paid plan order.
- Older orders have no `catalogVersion`; read it as "before versioning".
- Pending invitations older than 7 days become expired and stop holding seats as soon as this is deployed. Tell organization owners about this before release.

## 9. Open items
- PO decisions 1 and 2 above.
- Whether expired invitation records should be cleaned up by a scheduled job. Today they are ignored and removed lazily.
- The version increment on save (`$inc`) is covered only by code review: the unit tests use an in-memory store.
