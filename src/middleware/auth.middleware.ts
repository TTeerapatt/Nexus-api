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

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
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
