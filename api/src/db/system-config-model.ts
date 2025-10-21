/**
 * System Config Model
 * Key-value store for system configuration and state
 * Uses system_config table from migration 002
 */

import { query } from './connection';

export class SystemConfigModel {
  /**
   * Get config value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    const result = await query<{ value: T }>(
      'SELECT value FROM system_config WHERE key = $1',
      [key]
    );
    return result.rows[0]?.value || null;
  }

  /**
   * Set config value
   */
  static async set(key: string, value: any): Promise<void> {
    await query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  }

  /**
   * Delete config value
   */
  static async delete(key: string): Promise<void> {
    await query('DELETE FROM system_config WHERE key = $1', [key]);
  }

  /**
   * Get all config values
   */
  static async getAll(): Promise<Record<string, any>> {
    const result = await query<{ key: string; value: any }>(
      'SELECT key, value FROM system_config'
    );
    
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, any>);
  }
}
