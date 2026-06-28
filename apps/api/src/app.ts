import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { companiesRouter } from "./routes/companies.js";
import { partiesRouter } from "./routes/parties.js";
import { productsRouter } from "./routes/products.js";
import { documentsRouter } from "./routes/documents.js";
import { coefficientsRouter } from "./routes/coefficients.js";
import { transactionsRouter } from "./routes/transactions.js";
import { vdsRouter } from "./routes/vds.js";
import { adjustmentsRouter } from "./routes/adjustments.js";
import { returnsRouter } from "./routes/returns.js";
import { dashboardRouter } from "./routes/dashboard.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true, service: "bd-vat-api" }));

  app.use("/api/auth", authRouter);
  app.use("/api/companies", companiesRouter);
  app.use("/api/parties", partiesRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/coefficients", coefficientsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/vds", vdsRouter);
  app.use("/api/adjustments", adjustmentsRouter);
  app.use("/api/returns", returnsRouter);
  app.use("/api/dashboard", dashboardRouter);

  return app;
}
