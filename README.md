# Stock Night

A live "drink stock exchange" board for a bar. Prices drift up when a drink
sells and decay back toward normal when it doesn't — like a ticker board —
but this system is **display and staff-tooling only**. It never charges a
customer or talks to the POS; a bartender still rings up every sale on the
real POS at whatever price the board is showing at that moment.

## Why it's built this way (NY SLA compliance)

New York's State Liquor Authority prohibits two things this app is designed
to make structurally impossible:

1. **Unlimited drinks for a fixed price** ("open bar" style promos), in any
   form, including ones dressed up to look like something else.
2. **Selling below half of a drink's regular/posted price.** The SLA treats
   any price under 50% of the "regularly charged price" as an attempt to
   circumvent the law (see `sla.ny.gov/frequent-violations-abc-law-retailers`
   and `sla.ny.gov/restaurant-license-quick-reference-0`).

To satisfy #2, every drink has a fixed `listPrice` (the posted menu price)
that the algorithm never touches. The live `currentPrice` the board shows is
always mathematically clamped to `[0.5 × listPrice, 1.75 × listPrice]` in
`server/src/complianceRules.js` — the floor is enforced in code, not by
policy or staff discretion. Every price movement (a sale, a decay tick, or
an admin edit) is written to an append-only audit log with a timestamp and
cause, so there's a record if the SLA or your own management ever asks
"how did this price get set?"

This is **not legal advice** — before running this for real money, get the
bar's actual practice (hours, any happy-hour-style windows, local city
rules) confirmed with a lawyer or the SLA directly. Rules around timing and
advertising of drink specials vary by source and are worth a direct check.

## Structure

- `server/` — Node/Express API + the pricing engine. Runs standalone with
  an in-memory store, or against Firebase Realtime Database if you set the
  env vars (same pattern as Rootless's Firebase RTDB setup).
- `client/` — Vite + React app with two views:
  - `/display` — the ticker board (put this on the TV over the bar)
  - `/admin` — bartender/manager dashboard: record sales, add drinks, edit
    list prices (with a required reason, logged), view the audit trail

## Running it

```bash
# terminal 1
cd server
npm install
npm run dev        # http://localhost:4000

# terminal 2
cd client
npm install
npm run dev         # http://localhost:5173
```

No Firebase setup is required to try it — it runs on an in-memory store by
default. To persist data, copy `server/.env.example` to `server/.env` and
fill in a Firebase Realtime Database URL + service account credentials.
