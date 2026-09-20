import admin from "firebase-admin";
import { nanoid } from "nanoid";
import { applySale, applyDecayTick, applyReset } from "./pricingEngine.js";
import { checkReferencePriceChange, validatePricing } from "./complianceRules.js";
import { httpError } from "./errors.js";

let db = null;

export function initFirebase() {
  if (admin.apps.length) return admin.database();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  db = admin.database();
  return db;
}

// RTDB layout:
// /drinks/{id}                          -> drink record (current state only)
// /drinkHistory/{id}/{pushId}            -> individual history points
// /auditLog/{pushId}                     -> flat, append-only audit trail
// /listPriceChanges/{id}/{pushId}        -> timestamps only, for the 24h check
// /wholesalePriceChanges/{id}/{pushId}   -> timestamps only, for the 24h check
// /staff/{uid}/role                      -> "bartender" | "manager"
//
// Every node except drinks/drinkHistory is server-write-only (see
// database.rules.json) — clients can only mutate state through the API,
// which is what applies the compliance clamp and writes the audit trail.
// Price mutations use RTDB transactions so two simultaneous sales can't
// clobber each other by both reading the same stale currentPrice.

export const firebaseStore = {
  async listDrinks() {
    const snap = await db.ref("drinks").get();
    const val = snap.val() || {};
    return Object.values(val).sort((a, b) => a.name.localeCompare(b.name));
  },

  async getDrink(id) {
    const snap = await db.ref(`drinks/${id}`).get();
    return snap.val();
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
      createdAt: now,
    };
    await db.ref(`drinks/${id}`).set(drink);
    await db.ref(`drinkHistory/${id}`).push({ ts: now, price: listPrice, cause: "created" });
    await appendAudit({ type: "create_drink", drinkId: id, name, listPrice, wholesalePrice: drink.wholesalePrice });
    return drink;
  },

  async recordSale(id) {
    const ref = db.ref(`drinks/${id}`);
    let outcome = null;

    const { committed, snapshot } = await ref.transaction((drink) => {
      if (drink === null) return drink; // aborts: nothing to update
      if (drink.active === false) {
        outcome = { error: httpError(400, "Drink is marked 86'd / inactive") };
        return; // abort, no write
      }
      const { price, hitCeiling } = applySale(drink);
      outcome = { price, hitCeiling };
      return { ...drink, currentPrice: price, salesCount: (drink.salesCount || 0) + 1 };
    });

    if (!committed || !snapshot.exists()) {
      throw outcome?.error || httpError(404, "Drink not found");
    }

    const finalDrink = snapshot.val();
    await db.ref(`drinkHistory/${id}`).push({ ts: Date.now(), price: finalDrink.currentPrice, cause: "sale" });
    await appendAudit({ type: "price_sale", drinkId: id, name: finalDrink.name, price: finalDrink.currentPrice });
    return { drink: finalDrink, hitCeiling: outcome.hitCeiling };
  },

  async applyDecay(id) {
    const ref = db.ref(`drinks/${id}`);
    let changed = false;

    const { committed, snapshot } = await ref.transaction((drink) => {
      if (drink === null || drink.active === false) return drink;
      if (Math.abs(drink.currentPrice - drink.listPrice) < 0.01) return drink;
      const { price } = applyDecayTick(drink);
      if (price === drink.currentPrice) return drink;
      changed = true;
      return { ...drink, currentPrice: price };
    });

    if (!committed || !changed) return null;

    const finalDrink = snapshot.val();
    await db.ref(`drinkHistory/${id}`).push({ ts: Date.now(), price: finalDrink.currentPrice, cause: "decay" });
    await appendAudit({ type: "price_decay", drinkId: id, name: finalDrink.name, price: finalDrink.currentPrice });
    return finalDrink;
  },

  async resetPrice(id) {
    const ref = db.ref(`drinks/${id}`);
    const { committed, snapshot } = await ref.transaction((drink) => {
      if (drink === null) return drink;
      const { price } = applyReset(drink);
      return { ...drink, currentPrice: price };
    });
    if (!committed || !snapshot.exists()) throw httpError(404, "Drink not found");

    const finalDrink = snapshot.val();
    await db.ref(`drinkHistory/${id}`).push({ ts: Date.now(), price: finalDrink.currentPrice, cause: "reset" });
    await appendAudit({ type: "price_reset", drinkId: id, name: finalDrink.name, price: finalDrink.currentPrice });
    return finalDrink;
  },

  /**
   * Updates listPrice and/or wholesalePrice together in one transaction —
   * either may be omitted to leave it unchanged. Validated and logged as
   * one atomic audit entry so the two numbers never drift out of sync.
   */
  async setPricing(id, { listPrice, wholesalePrice, reason, actor }) {
    const listChangesRef = db.ref(`listPriceChanges/${id}`);
    const wholesaleChangesRef = db.ref(`wholesalePriceChanges/${id}`);
    const [prevListChanges, prevWholesaleChanges] = await Promise.all([
      listChangesRef.get().then((s) => Object.values(s.val() || {})),
      wholesaleChangesRef.get().then((s) => Object.values(s.val() || {})),
    ]);

    const ref = db.ref(`drinks/${id}`);
    let oldListPrice, oldWholesalePrice, listChanged, wholesaleChanged;

    const { committed, snapshot } = await ref.transaction((drink) => {
      if (drink === null) return drink;
      oldListPrice = drink.listPrice;
      oldWholesalePrice = drink.wholesalePrice;
      const nextListPrice = listPrice != null ? listPrice : drink.listPrice;
      const nextWholesalePrice = wholesalePrice != null ? wholesalePrice : drink.wholesalePrice;
      validatePricing({ listPrice: nextListPrice, wholesalePrice: nextWholesalePrice });
      listChanged = listPrice != null && listPrice !== drink.listPrice;
      wholesaleChanged = wholesalePrice != null && wholesalePrice !== drink.wholesalePrice;
      return { ...drink, listPrice: nextListPrice, wholesalePrice: nextWholesalePrice };
    });

    if (!committed || !snapshot.exists()) throw httpError(404, "Drink not found");

    const warnings = [];
    if (listChanged) {
      const { warning } = checkReferencePriceChange(prevListChanges, "List price");
      if (warning) warnings.push(warning);
      await listChangesRef.push(Date.now());
    }
    if (wholesaleChanged) {
      const { warning } = checkReferencePriceChange(prevWholesaleChanges, "Wholesale price");
      if (warning) warnings.push(warning);
      await wholesaleChangesRef.push(Date.now());
    }

    const finalDrink = snapshot.val();
    await appendAudit({
      type: "pricing_change",
      drinkId: id,
      name: finalDrink.name,
      oldListPrice,
      newListPrice: finalDrink.listPrice,
      oldWholesalePrice,
      newWholesalePrice: finalDrink.wholesalePrice,
      reason,
      actor,
    });

    return { drink: finalDrink, warning: warnings.join(" ") || null };
  },

  async setActive(id, active) {
    const ref = db.ref(`drinks/${id}`);
    const { committed, snapshot } = await ref.transaction((drink) => {
      if (drink === null) return drink;
      return { ...drink, active };
    });
    if (!committed || !snapshot.exists()) throw httpError(404, "Drink not found");
    const finalDrink = snapshot.val();
    await appendAudit({ type: active ? "activate_drink" : "deactivate_drink", drinkId: id, name: finalDrink.name });
    return finalDrink;
  },

  async deleteDrink(id) {
    const drink = (await db.ref(`drinks/${id}`).get()).val();
    await db.ref(`drinks/${id}`).remove();
    await db.ref(`drinkHistory/${id}`).remove();
    if (drink) await appendAudit({ type: "delete_drink", drinkId: id, name: drink.name });
  },

  async getAuditLog(limit = 200) {
    const snap = await db.ref("auditLog").limitToLast(limit).get();
    const val = snap.val() || {};
    return Object.values(val).sort((a, b) => b.ts - a.ts);
  },

  async getHistory(id, limit = 100) {
    const snap = await db.ref(`drinkHistory/${id}`).limitToLast(limit).get();
    const val = snap.val() || {};
    return Object.values(val).sort((a, b) => a.ts - b.ts);
  },
};

async function appendAudit(entry) {
  await db.ref("auditLog").push({ ts: Date.now(), ...entry });
}