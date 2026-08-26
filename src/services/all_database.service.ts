import pool from "../config/database.config";

export interface AllDatabaseListItem {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function getAllDatabases(): Promise<AllDatabaseListItem[]> {
  const result = await pool.query<AllDatabaseListItem>(
    `
      SELECT
        id, code, name, created_at, updated_at
      FROM all_database
      WHERE deleted_at IS NULL
      ORDER BY id ASC
    `
  );
  return result.rows;
}
