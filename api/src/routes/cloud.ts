/**
 * Cloud Multi-Device Management Routes - Legacy File
 * 
 * NOTE: This file has been reorganized for better maintainability:
 * - Device endpoints moved to: routes/devices.ts
 * - Admin endpoints moved to: routes/admin.ts
 * - Provisioning endpoints moved to: routes/provisioning.ts
 * - Device state endpoints moved to: routes/device-state.ts
 * 
 * This file is kept for backwards compatibility but may be removed in the future.
 */

import express from 'express';

export const router = express.Router();

// All routes have been moved to their respective files
// This file can be removed once all imports are updated

export default router;
