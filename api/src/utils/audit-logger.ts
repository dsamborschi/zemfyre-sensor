/**
 * Audit Logger - Structured logging for security events
 * Logs to both file and database for compliance and monitoring
 */

import winston from 'winston';
import { query } from '../db/connection';

// Winston logger configuration
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'Iotistic-api' },
  transports: [
    // Write all logs to audit.log
    new winston.transports.File({ 
      filename: 'logs/audit.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),
    // Write error logs to error.log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    }),
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Severity levels
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Common event types
export enum AuditEventType {
  // Provisioning events
  PROVISIONING_STARTED = 'provisioning_started',
  PROVISIONING_SUCCESS = 'provisioning_success',
  PROVISIONING_FAILED = 'provisioning_failed',
  PROVISIONING_KEY_INVALID = 'provisioning_key_invalid',
  PROVISIONING_KEY_EXPIRED = 'provisioning_key_expired',
  PROVISIONING_LIMIT_EXCEEDED = 'provisioning_limit_exceeded',
  
  // Authentication events
  DEVICE_AUTHENTICATED = 'device_authenticated',
  AUTHENTICATION_FAILED = 'authentication_failed',
  KEY_EXCHANGE_SUCCESS = 'key_exchange_success',
  KEY_EXCHANGE_FAILED = 'key_exchange_failed',
  
  // Device lifecycle
  DEVICE_REGISTERED = 'device_registered',
  DEVICE_ONLINE = 'device_online',
  DEVICE_OFFLINE = 'device_offline',
  
  // Key management
  API_KEY_CREATED = 'api_key_created',
  API_KEY_ROTATED = 'api_key_rotated',
  API_KEY_REVOKED = 'api_key_revoked',
  
  // Security events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  
  // Digital Twin events
  DEVICE_TWIN_ACCESSED = 'device_twin_accessed',
  FLEET_TWIN_ACCESSED = 'fleet_twin_accessed',
  FLEET_HEALTH_ACCESSED = 'fleet_health_accessed',
  FLEET_ALERTS_ACCESSED = 'fleet_alerts_accessed',
  
  // Digital Twin History events (Phase 4)
  DEVICE_TWIN_HISTORY_ACCESSED = 'device_twin_history_accessed',
  DEVICE_TWIN_ANOMALIES_ACCESSED = 'device_twin_anomalies_accessed'
}

export interface AuditLogEntry {
  eventType: AuditEventType | string;
  deviceUuid?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
  severity?: AuditSeverity;
}

/**
 * Log an audit event to both Winston and database
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  const {
    eventType,
    deviceUuid,
    userId,
    ipAddress,
    userAgent,
    details,
    severity = AuditSeverity.INFO
  } = entry;

  // Log to Winston
  const logData = {
    event: eventType,
    deviceUuid: deviceUuid ? `${deviceUuid.substring(0, 8)}...` : undefined,
    userId,
    ipAddress,
    severity,
    ...details
  };

  switch (severity) {
    case AuditSeverity.CRITICAL:
    case AuditSeverity.ERROR:
      auditLogger.error(eventType, logData);
      break;
    case AuditSeverity.WARNING:
      auditLogger.warn(eventType, logData);
      break;
    default:
      auditLogger.info(eventType, logData);
  }

  // Log to database
  try {
    await query(
      `INSERT INTO audit_logs (event_type, device_uuid, user_id, ip_address, user_agent, details, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventType,
        deviceUuid || null,
        userId || null,
        ipAddress || null,
        userAgent || null,
        details ? JSON.stringify(details) : null,
        severity
      ]
    );
  } catch (error) {
    // Don't fail the request if audit logging fails, but log to console
    console.error('Failed to write audit log to database:', error);
  }
}

/**
 * Log provisioning attempt (for rate limiting and abuse detection)
 */
export async function logProvisioningAttempt(
  ipAddress: string,
  deviceUuid: string | null,
  provisioningKeyId: string | null,
  success: boolean,
  errorMessage?: string,
  userAgent?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO provisioning_attempts (ip_address, device_uuid, provisioning_key_id, success, error_message, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ipAddress, deviceUuid, provisioningKeyId, success, errorMessage || null, userAgent || null]
    );
  } catch (error) {
    console.error('Failed to log provisioning attempt:', error);
  }
}

/**
 * Check if IP has exceeded provisioning rate limit
 */
export async function checkProvisioningRateLimit(ipAddress: string): Promise<void> {
  const result = await query(
    `SELECT COUNT(*) as attempt_count
     FROM provisioning_attempts
     WHERE ip_address = $1
     AND success = false
     AND created_at > NOW() - INTERVAL '1 hour'`,
    [ipAddress]
  );

  const attemptCount = parseInt(result.rows[0].attempt_count);

  if (attemptCount > 10) {
    await logAuditEvent({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      ipAddress,
      severity: AuditSeverity.WARNING,
      details: { attemptCount, window: '1 hour' }
    });
    throw new Error('Too many failed provisioning attempts. IP temporarily blocked.');
  }
}

export default {
  auditLogger,
  logAuditEvent,
  logProvisioningAttempt,
  checkProvisioningRateLimit,
  AuditSeverity,
  AuditEventType
};
