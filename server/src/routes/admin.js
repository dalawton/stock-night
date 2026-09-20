import { Router } from "express";
import { getStore } from "../store.js";

export const auditRouter = Router();

auditRouter.get("/", async (req, res) => {
  const store = await getStore();
  const log = await store.getAuditLog(Number(req.query.limit) || 200);
  res.json(log);
});
