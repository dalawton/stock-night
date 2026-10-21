import { Router } from "express";
import { getStore } from "../store.js";
import { priceChangePct } from "../pricingEngine.js";
import { clampToLegalRange } from "../complianceRules.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, httpError } from "../errors.js";

export const drinksRouter = Router();

// Everything - reads included - requires a signed-in staff account. The TV
// signs in with a read-only "display" account.
drinksRouter.get("/", requireAuth("display"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const drinks = await store.listDrinks();
  res.json(drinks.map((d) => withDerived(d, req.user.role)));
}));

// All price histories in one request (the board used to make one request per
// drink every few seconds). Must be registered before the /:id routes.
drinksRouter.get("/history", requireAuth("display"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const drinks = await store.listDrinks();
  const entries = await Promise.all(drinks.map(async (d) => [d.id, await store.getHistory(d.id)]));
  res.json(Object.fromEntries(entries));
}));

drinksRouter.get("/:id/history", requireAuth("display"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const history = await store.getHistory(req.params.id);
  res.json(history);
}));

// Everything below mutates state and requires a signed-in staff account.

drinksRouter.post("/", requireAuth("manager"), asyncHandler(async (req, res) => {
  const { name, category, listPrice, wholesalePrice } = req.body;
  if (!name || !name.trim() || typeof listPrice !== "number" || !(listPrice > 0)) {
    throw httpError(400, "name and a positive listPrice are required");
  }
  if (wholesalePrice != null && (typeof wholesalePrice !== "number" || wholesalePrice < 0 || wholesalePrice >= listPrice)) {
    throw httpError(400, "wholesalePrice must be a non-negative number less than listPrice");
  }
  const store = await getStore();
  const drink = await store.createDrink({ name, category, listPrice, wholesalePrice });
  res.status(201).json(withDerived(drink, req.user.role));
}));

drinksRouter.post("/:id/sale", requireAuth("bartender"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const { drink, hitCeiling } = await store.recordSale(req.params.id);
  res.json({ ...withDerived(drink, req.user.role), hitCeiling });
}));

drinksRouter.post("/:id/reset", requireAuth("manager"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const drink = await store.resetPrice(req.params.id);
  res.json(withDerived(drink, req.user.role));
}));

// Updates listPrice and/or wholesalePrice together — send only the field(s)
// you're changing. A reason is always required and gets logged.
drinksRouter.patch("/:id/pricing", requireAuth("manager"), asyncHandler(async (req, res) => {
  const { listPrice, wholesalePrice, reason } = req.body;
  if (listPrice == null && wholesalePrice == null) {
    throw httpError(400, "provide listPrice and/or wholesalePrice to update");
  }
  if (listPrice != null && listPrice <= 0) throw httpError(400, "listPrice must be positive");
  if (wholesalePrice != null && wholesalePrice < 0) throw httpError(400, "wholesalePrice cannot be negative");
  if (!reason || !reason.trim()) {
    throw httpError(400, "reason is required and gets logged to the audit trail");
  }
  const store = await getStore();
  const { drink, warning } = await store.setPricing(req.params.id, {
    listPrice,
    wholesalePrice,
    reason,
    actor: req.user.email || req.user.uid,
  });
  res.json({ ...withDerived(drink, req.user.role), warning });
}));

drinksRouter.post("/:id/active", requireAuth("manager"), asyncHandler(async (req, res) => {
  const { active } = req.body;
  const store = await getStore();
  const drink = await store.setActive(req.params.id, Boolean(active));
  res.json(withDerived(drink, req.user.role));
}));

drinksRouter.delete("/:id", requireAuth("manager"), asyncHandler(async (req, res) => {
  const store = await getStore();
  await store.deleteDrink(req.params.id);
  res.status(204).end();
}));

// Cost and floor are manager-only: they're stripped here, on the server, so a
// bartender (or anyone watching network traffic on the TV) never receives them.
function withDerived(drink, role) {
  const out = { ...drink, changePct: priceChangePct(drink) };
  if (role === "manager") {
    const { floor, ceiling, floorSource } = clampToLegalRange(drink.currentPrice, drink.listPrice, drink.wholesalePrice);
    return { ...out, floor, ceiling, floorSource };
  }
  delete out.wholesalePrice;
  return out;
}
