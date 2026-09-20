// Every clause in this file exists because of a specific rule the pricing
// engine must never violate — either a legal one (SLA) or a business one
// (never sell below cost). Keep the logic isolated here so it's easy to
// point to during an audit or a legal/financial review.

import { httpError } from "./errors.js";

const FLOOR_MULTIPLIER = Number(process.env.FLOOR_MULTIPLIER ?? 0.5);
const CEILING_MULTIPLIER = Number(process.env.CEILING_MULTIPLIER ?? 1.75);

// Two independent floors, and the effective floor is whichever is higher:
//
// 1. Legal floor — NY SLA: a drink price under half its "regularly charged
//    price" is treated as an attempt to circumvent the unlimited-drinks-
//    for-a-fixed-price ban. listPrice is that regular/posted price and
//    must never move with demand.
// 2. Cost floor — wholesalePrice is what the drink actually costs the bar.
//    Even where the legal floor would allow a lower price, the algorithm
//    should never let a drink sell for less than it costs to pour.
//
// wholesalePrice is optional (defaults to 0, i.e. no cost floor) so drinks
// can be added without it and backfilled later.
export function clampToLegalRange(rawPrice, listPrice, wholesalePrice = 0) {
  const legalFloor = round2(listPrice * FLOOR_MULTIPLIER);
  const costFloor = round2(wholesalePrice || 0);
  const floor = Math.max(legalFloor, costFloor);
  const ceiling = round2(listPrice * CEILING_MULTIPLIER);

  const clamped = Math.min(Math.max(rawPrice, floor), ceiling);
  return {
    price: round2(clamped),
    floor,
    legalFloor,
    costFloor,
    ceiling,
    floorSource: costFloor > legalFloor ? "cost" : "legal",
    hitFloor: clamped <= floor + 0.0001,
    hitCeiling: clamped >= ceiling - 0.0001,
  };
}

// A wholesale price that isn't comfortably under the list price makes the
// drink unsellable at a profit even at full menu price. Doesn't block it
// outright (maybe it's intentional — a loss-leader well drink), but this
// is exposed to the UI as a hard validation error on create/edit, not just
// a warning, because it's very likely a typo.
export function validatePricing({ listPrice, wholesalePrice }) {
  if (wholesalePrice != null && wholesalePrice >= listPrice) {
    throw httpError(
      400,
      `Wholesale price ($${wholesalePrice}) must be less than the list price ($${listPrice}) — otherwise this drink can never be sold at a profit.`
    );
  }
}

// Changing listPrice or wholesalePrice mid-service is how a floor could
// quietly be gamed (raise the "regular" price, the 50% floor rises with
// it) or cost accounting could drift unnoticed. This doesn't block the
// change — a bar legitimately updates its menu or gets a new distributor
// price — but it flags anything that looks like frequent intraday changes
// so a manager has to see it.
export function checkReferencePriceChange(previousChanges, label = "List price", windowMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  const recent = previousChanges.filter((t) => now - t < windowMs);
  return {
    allowed: true,
    warning:
      recent.length >= 1
        ? `${label} has already changed ${recent.length} time(s) in the last 24h. Frequent changes here can undermine the pricing floor and may draw scrutiny — make sure this is reflected on the physical menu too.`
        : null,
  };
}

// Blocks the one promo type the SLA disallows outright regardless of price:
// "unlimited drinks for a fixed price." This system never implements that
// mode, but this guard exists so nobody can add a feature that does without
// tripping something explicit.
export function assertNotUnlimitedPromo(mode) {
  if (mode === "unlimited_fixed_price") {
    throw new Error(
      "Unlimited drinks for a fixed price is prohibited under NY ABC law regardless of framing. Not implemented, not configurable."
    );
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}