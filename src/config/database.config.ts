import { Pool } from "pg";
import { loadEnvConfig } from "@next/env";
import dotenv from "dotenv";

dotenv.config();
loadEnvConfig(process.cwd());

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: false,
    });

export default pool;
