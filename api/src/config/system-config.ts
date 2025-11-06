/**
 * Global System Configuration Manager
 * 
 * Dynamic key-value configuration manager for the system_config table.
 * Provides in-memory caching with lazy loading and pattern-based access.
 * 
 * Usage:
 *   await SystemConfig.load();  // Load on startup
 *   
 *   // Simple key-value
 *   const value = await SystemConfig.get('some.setting');
 *   await SystemConfig.set('some.setting', { foo: 'bar' });
 *   
 *   // Pattern matching
 *   const allMqtt = await SystemConfig.getByPattern('mqtt.brokers.*');
 *   
 *   // Convenience methods
 *   const broker = await SystemConfig.getMqttBroker(1);
 *   const vpn = await SystemConfig.getVpnConfig(1);
 */

import { query } from '../db/connection';
import logger from '../utils/logger';

// ============================================================================
// SystemConfig Class - Singleton Pattern
// ============================================================================

class SystemConfigManager {
  private static instance: SystemConfigManager;
  
  // In-memory cache: key -> value (JSONB)
  private cache: Map<string, any> = new Map();
  private isLoaded: boolean = false;
  private lastLoadTime: Date | null = null;

  private constructor() {}

  public static getInstance(): SystemConfigManager {
    if (!SystemConfigManager.instance) {
      SystemConfigManager.instance = new SystemConfigManager();
    }
    return SystemConfigManager.instance;
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  /**
   * Load all configurations from database into memory
   * Called on application startup
   */
  public async load(): Promise<void> {
    try {
      logger.info('Loading system configurations from database...');

      const result = await query(`SELECT key, value, updated_at FROM system_config`);
      
      this.cache.clear();
      for (const row of result.rows) {
        this.cache.set(row.key, row.value);
      }

      this.isLoaded = true;
      this.lastLoadTime = new Date();
      
      logger.info('System configurations loaded', {
        keys: this.cache.size,
        loadTime: this.lastLoadTime.toISOString()
      });
    } catch (error) {
      logger.error('Failed to load system configurations', { error });
      throw error;
    }
  }

  /**
   * Reload all configurations from database
   */
  public async reload(): Promise<void> {
    logger.info('Reloading system configurations...');
    await this.load();
  }

  /**
   * Get a single configuration value by key
   * Returns from cache if loaded, otherwise queries database
   */
  public async get<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    if (this.isLoaded && this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    // Lazy load from database if not in cache
    const result = await query(
      `SELECT value FROM system_config WHERE key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      return defaultValue !== undefined ? defaultValue : null;
    }

    const value = result.rows[0].value;
    this.cache.set(key, value);
    return value as T;
  }

  /**
   * Set a configuration value
   * Updates both database and cache
   */
  public async set<T = any>(key: string, value: T): Promise<void> {
    await query(
      `INSERT INTO system_config (key, value, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE 
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );

    this.cache.set(key, value);
    logger.debug('Config updated', { key });
  }

  /**
   * Delete a configuration key
   */
  public async delete(key: string): Promise<void> {
    await query(`DELETE FROM system_config WHERE key = $1`, [key]);
    this.cache.delete(key);
    logger.debug('Config deleted', { key });
  }

  /**
   * Get all keys matching a pattern
   * Pattern uses SQL LIKE syntax (% = wildcard)
   * Example: 'mqtt.brokers.%' returns all MQTT broker configs
   */
  public async getByPattern<T = any>(pattern: string): Promise<Map<string, T>> {
    const result = await query(
      `SELECT key, value FROM system_config WHERE key LIKE $1`,
      [pattern]
    );

    const matches = new Map<string, T>();
    for (const row of result.rows) {
      matches.set(row.key, row.value as T);
      this.cache.set(row.key, row.value); // Update cache
    }

    return matches;
  }

  /**
   * Get all keys starting with a prefix
   * Example: 'mqtt.' returns all MQTT-related configs
   */
  public async getByPrefix<T = any>(prefix: string): Promise<Map<string, T>> {
    return this.getByPattern<T>(`${prefix}%`);
  }

  /**
   * Check if a key exists
   */
  public async has(key: string): Promise<boolean> {
    if (this.isLoaded && this.cache.has(key)) {
      return true;
    }

    const result = await query(
      `SELECT 1 FROM system_config WHERE key = $1`,
      [key]
    );
    return result.rows.length > 0;
  }

  /**
   * Get all cached keys (only works if load() was called)
   */
  public getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Clear cache (does not affect database)
   */
  public clearCache(): void {
    this.cache.clear();
    this.isLoaded = false;
    this.lastLoadTime = null;
    logger.debug('Config cache cleared');
  }

  // ==========================================================================
  // Convenience Helpers for Common Patterns
  // ==========================================================================

  /**
   * Get MQTT broker configuration by ID
   * Returns null if ID not provided (use default) or not found
   */
  public async getMqttBroker(brokerId?: number | null): Promise<any> {
    if (!brokerId) {
      const defaultId = await this.get<number>('mqtt.defaultBrokerId');
      if (!defaultId) return null;
      brokerId = defaultId;
    }
    return this.get(`mqtt.brokers.${brokerId}`);
  }

  /**
   * Get all MQTT brokers as array
   */
  public async getAllMqttBrokers(): Promise<any[]> {
    const brokers = await this.getByPattern('mqtt.brokers.%');
    return Array.from(brokers.values());
  }

  /**
   * Get VPN configuration by ID
   * Returns null if ID not provided (use default) or not found
   */
  public async getVpnConfig(configId?: number | null): Promise<any> {
    if (!configId) {
      const defaultId = await this.get<number>('vpn.defaultConfigId');
      if (!defaultId) return null;
      configId = defaultId;
    }
    return this.get(`vpn.configs.${configId}`);
  }

  /**
   * Get all VPN configs as array
   */
  public async getAllVpnConfigs(): Promise<any[]> {
    const configs = await this.getByPattern('vpn.configs.%');
    return Array.from(configs.values());
  }

  /**
   * Update MQTT broker config
   */
  public async updateMqttBroker(brokerId: number, updates: Record<string, any>): Promise<void> {
    const current = await this.get(`mqtt.brokers.${brokerId}`);
    if (!current) {
      throw new Error(`MQTT broker ${brokerId} not found`);
    }
    await this.set(`mqtt.brokers.${brokerId}`, { ...current, ...updates });
  }

  /**
   * Update VPN config
   */
  public async updateVpnConfig(configId: number, updates: Record<string, any>): Promise<void> {
    const current = await this.get(`vpn.configs.${configId}`);
    if (!current) {
      throw new Error(`VPN config ${configId} not found`);
    }
    await this.set(`vpn.configs.${configId}`, { ...current, ...updates });
  }
}

// Export singleton instance
export const SystemConfig = SystemConfigManager.getInstance();
