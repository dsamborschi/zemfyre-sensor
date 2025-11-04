import winston from 'winston';
import { LogConfig } from './types';

export function createLogger(config: LogConfig): winston.Logger {
  const formats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ];

  // Add colorize for console in development
  if (process.env.NODE_ENV === 'development') {
    formats.unshift(winston.format.colorize());
    formats.push(winston.format.simple());
  }

  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: config.level,
      format: winston.format.combine(...formats)
    })
  ];

  // Add file transport if specified
  if (config.file) {
    transports.push(
      new winston.transports.File({
        filename: config.file,
        level: config.level,
        format: winston.format.combine(...formats),
        maxsize: config.maxSize ? parseSize(config.maxSize) : 10485760, // 10MB default
        maxFiles: config.maxFiles || 5,
        tailable: true
      })
    );
  }

  return winston.createLogger({
    level: config.level,
    transports,
    exitOnError: false
  });
}

function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(kb?|mb?|gb?)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const size = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();

  switch (unit) {
    case 'k':
    case 'kb':
      return size * 1024;
    case 'm':
    case 'mb':
      return size * 1024 * 1024;
    case 'g':
    case 'gb':
      return size * 1024 * 1024 * 1024;
    default:
      return size;
  }
}