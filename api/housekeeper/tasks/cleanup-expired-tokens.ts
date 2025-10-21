/**
 * Cleanup Expired Tokens Task
 * 
 * Removes expired access tokens and old OAuth sessions
 */

import { HousekeeperTask } from '../index';

const task: HousekeeperTask = {
  name: 'cleanup-expired-tokens',
  startup: true, // Run on startup
  // Run daily at random time (2-3am) to avoid clustering if multiple instances
  schedule: `${Math.floor(Math.random() * 60)} ${2 + Math.floor(Math.random() * 2)} * * *`,
  
  run: async (app) => {
    console.log('🧹 Cleaning up expired tokens...');

    try {
      // Access Token model
      const AccessToken = app.models?.AccessToken || require('../../models/token');
      
      // Remove expired access tokens
      const tokenResult = await AccessToken.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      console.log(`✅ Deleted ${tokenResult.deletedCount || 0} expired access tokens`);

      // OAuth Session model
      const OAuthSession = app.models?.OAuthSession || require('../../models/oauth');
      
      // Remove OAuth sessions older than 5 minutes (abandoned auth flows)
      const sessionResult = await OAuthSession.deleteMany({
        createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
      });

      console.log(`✅ Deleted ${sessionResult.deletedCount || 0} abandoned OAuth sessions`);

    } catch (error: any) {
      console.error('❌ Failed to cleanup expired tokens:', error.message);
      throw error;
    }
  }
};

export default task;
