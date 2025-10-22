/**
 * General Purpose Logger
 * Wrapper around Winston for application logging
 */

import winston from 'winston';
import path from 'path';

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'Iotistic-api' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join('logs', 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),
    // Write error logs to error.log
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 
          ? '\n' + JSON.stringify(meta, null, 2) 
          : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      })
    )
  }));
}

// Export logger as default
export default logger;

// Also export named
export { logger };
