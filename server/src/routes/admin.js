import { Router } from "express";
import { getStore } from "../store.js";
import { requireAuth } from "../auth.js";
import { asyncHandler } from "../errors.js";

export const auditRouter = Router();

auditRouter.get("/", requireAuth("manager"), asyncHandler(async (req, res) => {
  const store = await getStore();
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(await store.getAuditLog(limit));
}));
