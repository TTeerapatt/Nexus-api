import pool from "../config/database.config";

export interface ResourceTypeListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getActiveResourceTypes(): Promise<ResourceTypeListItem[]> {
  const result = await pool.query<ResourceTypeListItem>(
    `
      SELECT
        id, code, name, description, is_active, created_at, updated_at
      FROM resource_types
      WHERE deleted_at IS NULL
        AND is_active = TRUE
      ORDER BY id ASC
    `
  );
  return result.rows;
}
