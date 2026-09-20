import { Router } from "express";
import { getStore } from "../store.js";
import { priceChangePct } from "../pricingEngine.js";
import { requireAuth } from "../../auth.js";
import { asyncHandler, httpError } from "../errors.js";

export const drinksRouter = Router();

// Reads are public/unauthenticated on purpose — the display board is a TV
// over the bar, nobody's logging in to look at it.
drinksRouter.get("/", asyncHandler(async (req, res) => {
  const store = await getStore();
  const drinks = await store.listDrinks();
  res.json(drinks.map(withDerived));
}));

drinksRouter.get("/:id/history", asyncHandler(async (req, res) => {
  const store = await getStore();
  const history = await store.getHistory(req.params.id);
  res.json(history);
}));

// Everything below mutates state and requires a signed-in staff account.

drinksRouter.post("/", requireAuth("manager"), asyncHandler(async (req, res) => {
  const { name, category, listPrice, wholesalePrice } = req.body;
  if (!name || !listPrice || listPrice <= 0) {
    throw httpError(400, "name and a positive listPrice are required");
  }
  if (wholesalePrice != null && (wholesalePrice < 0 || wholesalePrice >= listPrice)) {
    throw httpError(400, "wholesalePrice must be a non-negative number less than listPrice");
  }
  const store = await getStore();
  const drink = await store.createDrink({ name, category, listPrice, wholesalePrice });
  res.status(201).json(withDerived(drink));
}));

drinksRouter.post("/:id/sale", requireAuth("bartender"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const { drink, hitCeiling } = await store.recordSale(req.params.id);
  res.json({ ...withDerived(drink), hitCeiling });
}));

drinksRouter.post("/:id/reset", requireAuth("manager"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const drink = await store.resetPrice(req.params.id);
  res.json(withDerived(drink));
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
  res.json({ ...withDerived(drink), warning });
}));

drinksRouter.post("/:id/active", requireAuth("manager"), asyncHandler(async (req, res) => {
  const { active } = req.body;
  const store = await getStore();
  const drink = await store.setActive(req.params.id, Boolean(active));
  res.json(withDerived(drink));
}));

drinksRouter.delete("/:id", requireAuth("manager"), asyncHandler(async (req, res) => {
  const store = await getStore();
  await store.deleteDrink(req.params.id);
  res.status(204).end();
}));

function withDerived(drink) {
  return { ...drink, changePct: priceChangePct(drink) };
}