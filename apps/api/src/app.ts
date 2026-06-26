import express from "express";
import cors from "cors";
import { companiesRouter } from "./routes/companies.js";
import { transactionsRouter } from "./routes/transactions.js";
import { returnsRouter } from "./routes/returns.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true, service: "bd-vat-api" }));

  app.use("/api/companies", companiesRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/returns", returnsRouter);

  return app;
}
