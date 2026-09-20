import "dotenv/config";
import express from "express";
import { meRouter } from "./routes/me.js";
import cors from "cors";
import { drinksRouter } from "./routes/drinks.js";
import { auditRouter } from "./routes/admin.js";
import { startDecayLoop } from "./decayLoop.js";
import { getStore } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/drinks", drinksRouter);
app.use("/api/audit", auditRouter);
app.use("/api/me", meRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  await getStore(); // logs which backend it picked
  startDecayLoop(getStore);
  console.log(`[server] Stock Night API running on http://localhost:${PORT}`);
});

app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});
