import { Router } from "express";
import { requireAuth } from "../../auth.js";

export const meRouter = Router();

meRouter.get("/", requireAuth("bartender"), (req, res) => {
  res.json(req.user);
});