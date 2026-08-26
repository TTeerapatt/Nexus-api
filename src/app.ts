import cors from "cors";
import express from "express";
import path from "path";
import dotenv from "dotenv";
import authRouter from "./routes/auth.route";
import adminsRouter from "./routes/admins.route";
import adminLogRouter from "./routes/admin_log.route";
import adminMenuRouter from "./routes/admin_menu.route";
import portsRouter from "./routes/ports.route";
import projectsRouter from "./routes/projects.route";
import resourceTypesRouter from "./routes/resource_types.route";
import allDatabaseRouter from "./routes/all_database.route";
import databasesRouter from "./routes/databases.route";
import ciCdRouter from "./routes/ci_cd.route";

dotenv.config();

const app = express();
const API_PREFIX = "/nexus/api";

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const allowedOrigins = corsOrigin.split(",").map((origin) => origin.trim());
const useWildcardOrigin = allowedOrigins.includes("*");

app.use(
  cors({
    origin: useWildcardOrigin ? "*" : allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: !useWildcardOrigin,
  })
);
app.use(express.json());

app.use("/upload", express.static(path.resolve(process.cwd(), "upload")));

app.get(`${API_PREFIX}/health`, (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Nexus API is running",
  });
});

app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/admins`, adminsRouter);
app.use(`${API_PREFIX}/admin-log`, adminLogRouter);
app.use(`${API_PREFIX}/admin-menu`, adminMenuRouter);
app.use(`${API_PREFIX}/ports`, portsRouter);
app.use(`${API_PREFIX}/projects`, projectsRouter);
app.use(`${API_PREFIX}/resource-types`, resourceTypesRouter);
app.use(`${API_PREFIX}/all-database`, allDatabaseRouter);
app.use(`${API_PREFIX}/databases`, databasesRouter);
app.use(`${API_PREFIX}/ci-cd`, ciCdRouter);

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------------------------------");
  console.log(`Server running on http://0.0.0.0:${PORT}${API_PREFIX}`);
  console.log(`Check health on http://localhost:${PORT}${API_PREFIX}/health`);
  console.log("--------------------------------------------------------");
});
