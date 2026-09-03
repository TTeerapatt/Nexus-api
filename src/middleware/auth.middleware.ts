import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthAdminPayload {
  adminId: number;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthAdminPayload;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0] !== undefined ? String(value[0]) : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return "";
}

function extractQueryToken(req: Request): string {
  return firstQueryValue(req.query.token)?.trim() || "";
}

function applyAuthToken(
  req: Request,
  res: Response,
  next: NextFunction,
  token: string
): void {
  try {
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as AuthAdminPayload;
    if (!decoded?.adminId || !decoded?.email || !decoded?.role) {
      res.status(401).json({
        success: false,
        message: "Invalid token",
      });
      return;
    }

    req.admin = {
      adminId: Number(decoded.adminId),
      email: String(decoded.email),
      role: String(decoded.role),
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  applyAuthToken(req, res, next, extractBearerToken(req));
}

/**
 * EventSource cannot set Authorization headers.
 * Accept Bearer header or `?token=` for SSE endpoints only.
 */
export function authMiddlewareAllowQueryToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  applyAuthToken(
    req,
    res,
    next,
    extractBearerToken(req) || extractQueryToken(req)
  );
}
