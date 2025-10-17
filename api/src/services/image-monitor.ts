/**
 * Docker Hub Image Monitor Service
 * 
 * Polls Docker Hub API for new tags on registered images.
 * Automatically creates approval requests for new tags.
 */

import poolWrapper from '../db/connection';
import axios from 'axios';

const pool = poolWrapper.pool;

interface DockerHubTag {
  name: string;
  last_updated: string;
  digest: string;
  images: Array<{
    architecture: string;
    os: string;
    size: number;
  }>;
}

interface DockerHubResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: DockerHubTag[];
}

interface RegisteredImage {
  id: number;
  image_name: string;
  is_official: boolean;
  namespace: string | null;
  watch_for_updates: boolean;
}

export class ImageMonitorService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;

  constructor(checkIntervalMinutes: number = 60) {
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
  }

  /**
   * Start the monitoring service
   */
  start(): void {
    if (this.isRunning) {
      console.log('[ImageMonitor] Already running');
      return;
    }

    console.log(`[ImageMonitor] Starting monitor (check interval: ${this.checkIntervalMs / 60000} minutes)`);
    this.isRunning = true;

    // Run immediately on start
    this.checkForUpdates().catch(err => {
      console.error('[ImageMonitor] Error during initial check:', err);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkForUpdates().catch(err => {
        console.error('[ImageMonitor] Error during periodic check:', err);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[ImageMonitor] Stopped');
  }

  /**
   * Main update checking logic
   */
  private async checkForUpdates(): Promise<void> {
    console.log('[ImageMonitor] Checking for new image tags...');

    try {
      // Get all images that should be monitored
      const result = await pool.query<RegisteredImage>(
        `SELECT id, image_name, is_official, namespace, watch_for_updates 
         FROM images 
         WHERE watch_for_updates = true AND approval_status = 'approved'`
      );

      const images = result.rows;
      console.log(`[ImageMonitor] Monitoring ${images.length} images`);

      for (const image of images) {
        try {
          await this.checkImageForNewTags(image);
        } catch (err) {
          console.error(`[ImageMonitor] Error checking ${image.image_name}:`, err);
        }
      }

      console.log('[ImageMonitor] Check complete');
    } catch (err) {
      console.error('[ImageMonitor] Error in checkForUpdates:', err);
      throw err;
    }
  }

  /**
   * Check a specific image for new tags
   */
  private async checkImageForNewTags(image: RegisteredImage): Promise<void> {
    const { image_name, is_official, namespace } = image;
    
    // Build Docker Hub API URL
    const repoPath = is_official ? `library/${image_name}` : `${namespace || image_name}/${image_name.split('/').pop()}`;
    const url = `https://hub.docker.com/v2/repositories/${repoPath}/tags/`;

    console.log(`[ImageMonitor] Checking ${image_name} at ${url}`);

    try {
      // Fetch tags from Docker Hub
      const response = await axios.get<DockerHubResponse>(url, {
        params: {
          page_size: 100,
          ordering: '-last_updated'
        },
        timeout: 30000
      });

      const remoteTags = response.data.results;
      console.log(`[ImageMonitor] Found ${remoteTags.length} tags for ${image_name}`);

      // Get existing tags from database
      const existingTagsResult = await pool.query<{ tag: string }>(
        'SELECT tag FROM image_tags WHERE image_id = $1',
        [image.id]
      );
      const existingTags = new Set(existingTagsResult.rows.map(row => row.tag));

      // Find new tags
      const newTags = remoteTags.filter(tag => !existingTags.has(tag.name));

      if (newTags.length === 0) {
        console.log(`[ImageMonitor] No new tags for ${image_name}`);
        return;
      }

      console.log(`[ImageMonitor] Found ${newTags.length} new tags for ${image_name}`);

      // Create approval requests for new tags
      for (const tag of newTags) {
        await this.createApprovalRequest(image, tag);
      }

    } catch (err: any) {
      if (err.response?.status === 404) {
        console.warn(`[ImageMonitor] Image ${image_name} not found on Docker Hub`);
      } else {
        console.error(`[ImageMonitor] Error fetching tags for ${image_name}:`, err.message);
      }
    }
  }

  /**
   * Create an approval request for a new tag
   */
  private async createApprovalRequest(
    image: RegisteredImage,
    tag: DockerHubTag
  ): Promise<void> {
    try {
      // Check if approval request already exists
      const existingRequest = await pool.query(
        `SELECT id FROM image_approval_requests 
         WHERE image_id = $1 AND tag_name = $2`,
        [image.id, tag.name]
      );

      if (existingRequest.rows.length > 0) {
        console.log(`[ImageMonitor] Approval request already exists for ${image.image_name}:${tag.name}`);
        return;
      }

      // Create approval request
      await pool.query(
        `INSERT INTO image_approval_requests 
         (image_id, image_name, tag_name, status, requested_at, metadata) 
         VALUES ($1, $2, $3, 'pending', NOW(), $4)`,
        [
          image.id,
          image.image_name,
          tag.name,
          JSON.stringify({
            last_updated: tag.last_updated,
            digest: tag.digest,
            architectures: tag.images.map(img => img.architecture),
            auto_detected: true,
            source: 'image_monitor'
          })
        ]
      );

      console.log(`[ImageMonitor] ✅ Created approval request for ${image.image_name}:${tag.name}`);
    } catch (err) {
      console.error(`[ImageMonitor] Error creating approval request for ${image.image_name}:${tag.name}:`, err);
    }
  }

  /**
   * Manually trigger a check for a specific image
   */
  async checkImage(imageName: string): Promise<void> {
    const result = await pool.query<RegisteredImage>(
      'SELECT id, image_name, is_official, namespace, watch_for_updates FROM images WHERE image_name = $1',
      [imageName]
    );

    if (result.rows.length === 0) {
      throw new Error(`Image ${imageName} not found in registry`);
    }

    await this.checkImageForNewTags(result.rows[0]);
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      running: this.isRunning,
      checkIntervalMinutes: this.checkIntervalMs / 60000,
      nextCheckIn: this.intervalId ? this.checkIntervalMs : null
    };
  }
}

// Singleton instance
export const imageMonitor = new ImageMonitorService(60); // Check every 60 minutes
