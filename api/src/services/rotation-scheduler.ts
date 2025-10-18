/**
 * API Key Rotation Scheduler
 * 
 * Runs periodic checks for devices needing API key rotation
 * and automatically rotates keys before they expire.
 */

import { rotateExpiredKeys, revokeExpiredKeys } from './api-key-rotation';

let rotationInterval: NodeJS.Timeout | null = null;
let revocationInterval: NodeJS.Timeout | null = null;

const ROTATION_CHECK_INTERVAL = parseInt(process.env.ROTATION_CHECK_INTERVAL_MINUTES || '60') * 60 * 1000; // Default: 1 hour
const REVOCATION_CHECK_INTERVAL = parseInt(process.env.REVOCATION_CHECK_INTERVAL_MINUTES || '60') * 60 * 1000; // Default: 1 hour

/**
 * Start the rotation scheduler
 */
export function startRotationScheduler(): void {
  if (rotationInterval) {
    console.log('⚠️  Rotation scheduler already running');
    return;
  }

  console.log(`🔄 Starting API key rotation scheduler (check every ${ROTATION_CHECK_INTERVAL / 60000} minutes)`);

  // Run immediately on startup
  runRotationCheck();

  // Schedule periodic checks
  rotationInterval = setInterval(runRotationCheck, ROTATION_CHECK_INTERVAL);
}

/**
 * Start the revocation scheduler (removes old keys after grace period)
 */
export function startRevocationScheduler(): void {
  if (revocationInterval) {
    console.log('⚠️  Revocation scheduler already running');
    return;
  }

  console.log(`🔒 Starting API key revocation scheduler (check every ${REVOCATION_CHECK_INTERVAL / 60000} minutes)`);

  // Run immediately on startup
  runRevocationCheck();

  // Schedule periodic checks
  revocationInterval = setInterval(runRevocationCheck, REVOCATION_CHECK_INTERVAL);
}

/**
 * Stop the rotation scheduler
 */
export function stopRotationScheduler(): void {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
    console.log('✅ Rotation scheduler stopped');
  }
}

/**
 * Stop the revocation scheduler
 */
export function stopRevocationScheduler(): void {
  if (revocationInterval) {
    clearInterval(revocationInterval);
    revocationInterval = null;
    console.log('✅ Revocation scheduler stopped');
  }
}

/**
 * Run rotation check (called periodically)
 */
async function runRotationCheck(): Promise<void> {
  try {
    console.log('\n🔄 Running scheduled API key rotation check...');
    const rotations = await rotateExpiredKeys();
    
    if (rotations.length > 0) {
      console.log(`✅ Rotation check complete: ${rotations.length} keys rotated`);
    }
  } catch (error) {
    console.error('❌ Rotation check failed:', error);
  }
}

/**
 * Run revocation check (called periodically)
 */
async function runRevocationCheck(): Promise<void> {
  try {
    console.log('\n🔒 Running scheduled API key revocation check...');
    const revokedCount = await revokeExpiredKeys();
    
    if (revokedCount > 0) {
      console.log(`✅ Revocation check complete: ${revokedCount} old keys revoked`);
    }
  } catch (error) {
    console.error('❌ Revocation check failed:', error);
  }
}

/**
 * Initialize all schedulers
 */
export function initializeSchedulers(): void {
  const rotationEnabled = process.env.ENABLE_API_KEY_ROTATION !== 'false'; // Default: enabled
  const revocationEnabled = process.env.ENABLE_API_KEY_REVOCATION !== 'false'; // Default: enabled

  if (rotationEnabled) {
    startRotationScheduler();
  } else {
    console.log('⏸️  API key rotation scheduler disabled (ENABLE_API_KEY_ROTATION=false)');
  }

  if (revocationEnabled) {
    startRevocationScheduler();
  } else {
    console.log('⏸️  API key revocation scheduler disabled (ENABLE_API_KEY_REVOCATION=false)');
  }
}

/**
 * Shutdown all schedulers
 */
export function shutdownSchedulers(): void {
  stopRotationScheduler();
  stopRevocationScheduler();
}

export default {
  startRotationScheduler,
  startRevocationScheduler,
  stopRotationScheduler,
  stopRevocationScheduler,
  initializeSchedulers,
  shutdownSchedulers
};
