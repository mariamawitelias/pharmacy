import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./lib/errors.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import medicineRoutes from "./routes/medicine.routes.js";
import pharmacyRoutes from "./routes/pharmacy.routes.js";
import searchRoutes from "./routes/search.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/medicines", medicineRoutes);
app.use("/pharmacies", searchRoutes);
app.use("/pharmacies", pharmacyRoutes);

app.use(errorHandler);
export default app;