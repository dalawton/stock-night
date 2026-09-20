import { nanoid } from "nanoid";
import { applySale, applyDecayTick, applyReset } from "./pricingEngine.js";
import { checkReferencePriceChange, validatePricing } from "./complianceRules.js";
import { httpError } from "./errors.js";

// Node is single-threaded and this store does no I/O between reading and
// writing a drink, so there's no real race window here the way there is
// with Firebase's network round-trip — a straightforward read-modify-write
// is safe. The method names/signatures still match firebaseStore.js so
// routes don't need to know which backend is active.

let drinks = {};
let auditLog = [];
let listPriceChangeLog = {};
let wholesalePriceChangeLog = {};

export const memoryStore = {
  async listDrinks() {
    return Object.values(drinks).sort((a, b) => a.name.localeCompare(b.name));
  },

  async getDrink(id) {
    return drinks[id] ?? null;
  },

  async createDrink({ name, category, listPrice, wholesalePrice }) {
    validatePricing({ listPrice, wholesalePrice });
    const id = nanoid(8);
    const now = Date.now();
    const drink = {
      id,
      name,
      category: category || "misc",
      listPrice,
      wholesalePrice: wholesalePrice || 0,
      currentPrice: listPrice,
      active: true,
      salesCount: 0,
      history: [{ ts: now, price: listPrice, cause: "created" }],
      createdAt: now,
    };
    drinks[id] = drink;
    listPriceChangeLog[id] = [];
    wholesalePriceChangeLog[id] = [];
    appendAudit({ type: "create_drink", drinkId: id, name, listPrice, wholesalePrice: drink.wholesalePrice });
    return stripHistory(drink);
  },

  async recordSale(id) {
    const drink = drinks[id];
    if (!drink) throw httpError(404, "Drink not found");
    if (!drink.active) throw httpError(400, "Drink is marked 86'd / inactive");

    const { price, hitCeiling } = applySale(drink);
    drink.currentPrice = price;
    drink.salesCount += 1;
    pushHistory(drink, { price, cause: "sale" });
    appendAudit({ type: "price_sale", drinkId: id, name: drink.name, price });
    return { drink: stripHistory(drink), hitCeiling };
  },

  async applyDecay(id) {
    const drink = drinks[id];
    if (!drink || !drink.active) return null;
    if (Math.abs(drink.currentPrice - drink.listPrice) < 0.01) return null;

    const { price } = applyDecayTick(drink);
    if (price === drink.currentPrice) return null;
    drink.currentPrice = price;
    pushHistory(drink, { price, cause: "decay" });
    appendAudit({ type: "price_decay", drinkId: id, name: drink.name, price });
    return stripHistory(drink);
  },

  async resetPrice(id) {
    const drink = drinks[id];
    if (!drink) throw httpError(404, "Drink not found");
    const { price } = applyReset(drink);
    drink.currentPrice = price;
    pushHistory(drink, { price, cause: "reset" });
    appendAudit({ type: "price_reset", drinkId: id, name: drink.name, price });
    return stripHistory(drink);
  },

  /**
   * Updates listPrice and/or wholesalePrice together (either may be
   * omitted to leave it unchanged). Validated and logged as one atomic
   * audit entry so the two numbers never drift out of sync in the trail.
   */
  async setPricing(id, { listPrice, wholesalePrice, reason, actor }) {
    const drink = drinks[id];
    if (!drink) throw httpError(404, "Drink not found");

    const nextListPrice = listPrice != null ? listPrice : drink.listPrice;
    const nextWholesalePrice = wholesalePrice != null ? wholesalePrice : drink.wholesalePrice;
    validatePricing({ listPrice: nextListPrice, wholesalePrice: nextWholesalePrice });

    const warnings = [];
    if (listPrice != null && listPrice !== drink.listPrice) {
      const { warning } = checkReferencePriceChange(listPriceChangeLog[id] || [], "List price");
      if (warning) warnings.push(warning);
      listPriceChangeLog[id] = [...(listPriceChangeLog[id] || []), Date.now()];
    }
    if (wholesalePrice != null && wholesalePrice !== drink.wholesalePrice) {
      const { warning } = checkReferencePriceChange(wholesalePriceChangeLog[id] || [], "Wholesale price");
      if (warning) warnings.push(warning);
      wholesalePriceChangeLog[id] = [...(wholesalePriceChangeLog[id] || []), Date.now()];
    }

    const oldListPrice = drink.listPrice;
    const oldWholesalePrice = drink.wholesalePrice;
    drink.listPrice = nextListPrice;
    drink.wholesalePrice = nextWholesalePrice;

    appendAudit({
      type: "pricing_change",
      drinkId: id,
      name: drink.name,
      oldListPrice,
      newListPrice: nextListPrice,
      oldWholesalePrice,
      newWholesalePrice: nextWholesalePrice,
      reason,
      actor,
    });

    return { drink: stripHistory(drink), warning: warnings.join(" ") || null };
  },

  async setActive(id, active) {
    const drink = drinks[id];
    if (!drink) throw httpError(404, "Drink not found");
    drink.active = active;
    appendAudit({ type: active ? "activate_drink" : "deactivate_drink", drinkId: id, name: drink.name });
    return stripHistory(drink);
  },

  async deleteDrink(id) {
    const drink = drinks[id];
    delete drinks[id];
    delete listPriceChangeLog[id];
    delete wholesalePriceChangeLog[id];
    if (drink) appendAudit({ type: "delete_drink", drinkId: id, name: drink.name });
  },

  async getAuditLog(limit = 200) {
    return auditLog.slice(-limit).reverse();
  },

  async getHistory(id, limit = 100) {
    const drink = drinks[id];
    if (!drink) return [];
    return drink.history.slice(-limit);
  },
};

function pushHistory(drink, entry) {
  drink.history.push({ ts: Date.now(), ...entry });
  if (drink.history.length > 200) drink.history.shift();
}

function stripHistory({ history, ...rest }) {
  return rest;
}

function appendAudit(entry) {
  auditLog.push({ ts: Date.now(), ...entry });
  if (auditLog.length > 5000) auditLog.shift();
}

export function _resetMemoryStore() {
  drinks = {};
  auditLog = [];
  listPriceChangeLog = {};
  wholesalePriceChangeLog = {};
}