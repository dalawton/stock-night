import { clampToLegalRange } from "./complianceRules.js";

const BUMP_PCT = Number(process.env.BUMP_PCT ?? 0.03); // per sale
const DECAY_PCT = Number(process.env.DECAY_PCT ?? 0.05); // per tick, toward listPrice

/**
 * A sale came in: nudge the price up by a percentage of the list price,
 * then clamp it into the legal range.
 */
export function applySale(drink) {
  const raw = drink.currentPrice + drink.listPrice * BUMP_PCT;
  const { price, floor, ceiling, hitCeiling } = clampToLegalRange(raw, drink.listPrice);
  return {
    price,
    floor,
    ceiling,
    hitCeiling,
    cause: "sale",
  };
}

/**
 * Nobody's ordering it: drift the price back toward listPrice. Works
 * whether the price is currently above or below list.
 */
export function applyDecayTick(drink) {
  const gap = drink.listPrice - drink.currentPrice;
  const raw = drink.currentPrice + gap * DECAY_PCT;
  const { price, floor, ceiling, hitFloor } = clampToLegalRange(raw, drink.listPrice);
  return {
    price,
    floor,
    ceiling,
    hitFloor,
    cause: "decay",
  };
}

/**
 * Manager resets a drink back to its posted list price (e.g. after a rush,
 * or to start the night clean).
 */
export function applyReset(drink) {
  const { price, floor, ceiling } = clampToLegalRange(drink.listPrice, drink.listPrice);
  return { price, floor, ceiling, cause: "reset" };
}

export function priceChangePct(drink) {
  if (!drink.listPrice) return 0;
  return Math.round(((drink.currentPrice - drink.listPrice) / drink.listPrice) * 1000) / 10;
}
