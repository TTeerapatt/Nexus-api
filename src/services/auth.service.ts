import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/database.config";
import { insertAdminLog } from "./admin_log.service";

const BCRYPT_ROUNDS = 10;
const ALLOWED_ROLES = ["owner", "admin", "staff"] as const;

export type AdminRole = (typeof ALLOWED_ROLES)[number];

export interface AdminProfile {
  id: number;
  email: string;
  display_name: string;
  role: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenResult {
  token: string;
  admin: AdminProfile;
}

export interface CreateAdminInput {
  email: string;
  password: string;
  display_name: string;
  role?: string;
}

export interface LoginAdminInput {
  email: string;
  password: string;
}

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AuthError(500, "JWT_SECRET is not configured");
  }
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertCreateInput(input: CreateAdminInput): {
  email: string;
  password: string;
  display_name: string;
  role: AdminRole;
} {
  const email = normalizeEmail(input.email || "");
  const password = (input.password || "").trim();
  const display_name = (input.display_name || "").trim();
  const role = (input.role || "staff").trim() as AdminRole;

  if (!email || !isValidEmail(email)) {
    throw new AuthError(400, "Valid email is required");
  }
  if (password.length < 6) {
    throw new AuthError(400, "Password must be at least 6 characters");
  }
  if (!display_name) {
    throw new AuthError(400, "display_name is required");
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw new AuthError(400, "role must be one of: owner, admin, staff");
  }

  return { email, password, display_name, role };
}

function assertLoginInput(input: LoginAdminInput): {
  email: string;
  password: string;
} {
  const email = normalizeEmail(input.email || "");
  const password = (input.password || "").trim();

  if (!email || !isValidEmail(email)) {
    throw new AuthError(400, "Valid email is required");
  }
  if (!password) {
    throw new AuthError(400, "Password is required");
  }

  return { email, password };
}

function signToken(admin: AdminProfile): string {
  return jwt.sign(
    {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export async function createAdmin(
  input: CreateAdminInput
): Promise<AuthTokenResult> {
  const data = assertCreateInput(input);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT id
        FROM admins
        WHERE email = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [data.email]
    );

    if (existing.rows.length > 0) {
      throw new AuthError(409, "Email already exists");
    }

    const adminResult = await client.query<AdminProfile>(
      `
        INSERT INTO admins (email, display_name, role)
        VALUES ($1, $2, $3)
        RETURNING
          id, email, display_name, role, last_login_at,
          created_at, updated_at
      `,
      [data.email, data.display_name, data.role]
    );

    const admin = adminResult.rows[0];

    await client.query(
      `
        INSERT INTO admin_auth (admin_id, password_hash)
        VALUES ($1, $2)
      `,
      [admin.id, passwordHash]
    );

    await insertAdminLog(
      {
        adminId: Number(admin.id),
        action: "create",
        entityType: "admin",
        entityId: Number(admin.id),
        message: "Admin registered",
      },
      client
    );

    await client.query("COMMIT");

    return {
      token: signToken(admin),
      admin,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loginAdmin(
  input: LoginAdminInput
): Promise<AuthTokenResult> {
  const data = assertLoginInput(input);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: number;
      email: string;
      display_name: string;
      role: string;
      last_login_at: string | null;
      created_at: string;
      updated_at: string;
      password_hash: string;
    }>(
      `
        SELECT
          a.id,
          a.email,
          a.display_name,
          a.role,
          a.last_login_at,
          a.created_at,
          a.updated_at,
          aa.password_hash
        FROM admins a
        INNER JOIN admin_auth aa
          ON aa.admin_id = a.id
         AND aa.deleted_at IS NULL
        WHERE a.email = $1
          AND a.deleted_at IS NULL
        LIMIT 1
      `,
      [data.email]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AuthError(401, "Invalid email or password");
    }

    const matched = await bcrypt.compare(data.password, row.password_hash);
    if (!matched) {
      throw new AuthError(401, "Invalid email or password");
    }

    const updated = await client.query<AdminProfile>(
      `
        UPDATE admins
        SET last_login_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING
          id, email, display_name, role, last_login_at,
          created_at, updated_at
      `,
      [row.id]
    );

    await insertAdminLog(
      {
        adminId: Number(row.id),
        action: "login",
        entityType: "admin",
        entityId: Number(row.id),
        message: "Admin logged in",
      },
      client
    );

    await client.query("COMMIT");

    const admin = updated.rows[0];
    return {
      token: signToken(admin),
      admin,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
