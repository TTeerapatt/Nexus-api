import type { NextFunction, Request, Response } from "express";
import pool from "../config/database.config";

export type PermissionActionCode =
  | "view"
  | "add"
  | "edit"
  | "delete"
  | "export"
  | (string & {});

export type PermissionPair = {
  tabCode: string;
  actionCode: PermissionActionCode;
};

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizePermissionPairs(pairs: PermissionPair[]): PermissionPair[] {
  const normalized = pairs
    .map((pair) => ({
      tabCode: String(pair.tabCode ?? "").trim().toLowerCase(),
      actionCode: String(pair.actionCode ?? "").trim().toLowerCase() as PermissionActionCode,
    }))
    .filter((pair) => pair.tabCode !== "" && pair.actionCode !== "");

  if (normalized.length === 0) {
    throw new Error("At least one valid permission pair is required");
  }

  return normalized;
}

async function hasAnyPermission(
  adminId: number,
  pairs: PermissionPair[]
): Promise<boolean> {
  const normalized = normalizePermissionPairs(pairs);

  const tupleSql = normalized
    .map((_pair, index) => `($${index * 2 + 2}, $${index * 2 + 3})`)
    .join(", ");

  const params: unknown[] = [adminId];
  for (const pair of normalized) {
    params.push(pair.tabCode, pair.actionCode);
  }

  const result = await pool.query<{ allowed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM admins ad
        INNER JOIN admin_permissions ap
          ON ap.admin_id = ad.id
         AND ap.deleted_at IS NULL
         AND ap.is_allowed = TRUE
        INNER JOIN admin_menu_tab_action mta
          ON mta.id = ap.menu_tab_action_id
         AND mta.deleted_at IS NULL
        INNER JOIN admin_menu_tab mt
          ON mt.id = mta.menu_tab_id
         AND mt.deleted_at IS NULL
         AND mt.is_active = TRUE
        INNER JOIN admin_menu_label ml
          ON ml.id = mt.menu_label_id
         AND ml.deleted_at IS NULL
         AND ml.is_active = TRUE
        INNER JOIN admin_permission_action pa
          ON pa.id = mta.permission_action_id
         AND pa.deleted_at IS NULL
         AND pa.is_active = TRUE
        INNER JOIN (
          VALUES ${tupleSql}
        ) AS req_perm(tab_code, action_code)
          ON req_perm.tab_code = mt.code
         AND req_perm.action_code = pa.code
        WHERE ad.id = $1
          AND ad.deleted_at IS NULL
      ) AS allowed
    `,
    params
  );

  return result.rows[0]?.allowed === true;
}

export function requirePermission(
  tabCode: string,
  actionCode: PermissionActionCode
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return requireAnyPermission([{ tabCode, actionCode }]);
}

export function requireAnyPermission(
  pairs: PermissionPair[]
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const normalized = normalizePermissionPairs(pairs);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const adminId = req.admin?.adminId;

    if (!adminId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    // owner ผ่านทุกสิทธิ์
    if (req.admin?.role === "owner") {
      next();
      return;
    }

    try {
      const allowed = await hasAnyPermission(Number(adminId), normalized);
      if (allowed) {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        message: "Forbidden: insufficient permission",
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to verify permission";
      res.status(500).json({
        success: false,
        message,
      });
    }
  };
}

export function requireSelfOrPermission(
  tabCode: string,
  actionCode: PermissionActionCode
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const targetIdRaw = routeParam(req.params.id);
    const targetId = Number(targetIdRaw);
    const currentAdminId = req.admin?.adminId;

    if (
      Number.isInteger(targetId) &&
      Number.isInteger(currentAdminId) &&
      targetId > 0 &&
      targetId === currentAdminId
    ) {
      next();
      return;
    }

    await requirePermission(tabCode, actionCode)(req, res, next);
  };
}
