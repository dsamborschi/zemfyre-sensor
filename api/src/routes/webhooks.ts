/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from Docker Hub, GitHub Container Registry, etc.
 * for automated image update notifications.
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import poolWrapper from '../db/connection';
import { ImageUpdateManager } from '../services/image-update-manager';
import { EventPublisher } from '../services/event-sourcing';
import { imageUpdateConfig } from '../config/image-updates';

const router = express.Router();
const pool = poolWrapper.pool; // Use underlying Pool instance

/**
 * Verify webhook signature (Docker Hub/GHCR)
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Parse Docker Hub webhook payload
 */
function parseDockerHubPayload(body: any): {
  imageName: string;
  newTag: string;
  registry: string;
} | null {
  try {
    const repoName = body.repository?.repo_name;
    const tag = body.push_data?.tag;

    if (!repoName || !tag) {
      console.error('[Webhook] Invalid Docker Hub payload: missing repo_name or tag');
      return null;
    }

    return {
      imageName: repoName,
      newTag: tag,
      registry: 'docker.io',
    };
  } catch (error) {
    console.error('[Webhook] Error parsing Docker Hub payload:', error);
    return null;
  }
}

/**
 * Parse GitHub Container Registry webhook payload
 */
function parseGHCRPayload(body: any): {
  imageName: string;
  newTag: string;
  registry: string;
} | null {
  try {
    const packageName = body.package?.name;
    const tag = body.package_version?.container_metadata?.tag?.name;

    if (!packageName || !tag) {
      console.error('[Webhook] Invalid GHCR payload: missing package or tag');
      return null;
    }

    return {
      imageName: `ghcr.io/${packageName}`,
      newTag: tag,
      registry: 'ghcr.io',
    };
  } catch (error) {
    console.error('[Webhook] Error parsing GHCR payload:', error);
    return null;
  }
}

/**
 * Find matching update policy for image
 */
async function findMatchingPolicy(imageName: string): Promise<any | null> {
  // Find policy with glob pattern matching
  // Convert glob-style wildcards (*) to SQL wildcards (%)
  // image_pattern examples: "redis:*", "iotistic/agent:*", "nginx*"
  const result = await pool.query(
    `SELECT * FROM image_update_policies
     WHERE enabled = true
       AND (
         -- Try exact match with glob converted to SQL wildcard
         $1 LIKE REPLACE(image_pattern, '*', '%')
         OR
         -- Try regex match for more complex patterns
         $1 ~ image_pattern
       )
     ORDER BY 
       -- Prefer more specific patterns (longer = more specific)
       LENGTH(image_pattern) DESC,
       created_at DESC
     LIMIT 1`,
    [imageName]
  );

  return result.rows[0] || null;
}

/**
 * POST /api/v1/webhooks/docker-registry
 * 
 * Receive webhook notifications from Docker Hub or GitHub Container Registry
 * when new images are pushed.
 */
router.post('/docker-registry', async (req: Request, res: Response) => {
  console.log('[Webhook] Received Docker registry webhook');

  try {
    // Verify webhook signature if configured
    if (imageUpdateConfig.VERIFY_WEBHOOK_SIGNATURE && imageUpdateConfig.WEBHOOK_SECRET) {
      const signature = req.headers['x-hub-signature'] as string;
      const isValid = verifyWebhookSignature(
        JSON.stringify(req.body),
        signature,
        imageUpdateConfig.WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error('[Webhook] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Determine webhook source and parse payload
    let imageInfo: { imageName: string; newTag: string; registry: string } | null = null;

    // Try Docker Hub format
    if (req.body.repository?.repo_name) {
      imageInfo = parseDockerHubPayload(req.body);
    }
    // Try GHCR format
    else if (req.body.package?.name) {
      imageInfo = parseGHCRPayload(req.body);
    }

    if (!imageInfo) {
      console.error('[Webhook] Unable to parse webhook payload');
      return res.status(400).json({ error: 'Invalid payload format' });
    }

    console.log(`[Webhook] Image update detected: ${imageInfo.imageName}:${imageInfo.newTag}`);

    // Find matching update policy
    const policy = await findMatchingPolicy(imageInfo.imageName);

    if (!policy) {
      console.log(`[Webhook] No matching policy found for ${imageInfo.imageName}`);
      return res.status(200).json({
        message: 'No matching policy',
        image: imageInfo.imageName,
        tag: imageInfo.newTag,
      });
    }

    console.log(`[Webhook] Found matching policy: ${policy.image_pattern} (strategy: ${policy.update_strategy})`);

    // Check if image is in approved registry (for public images)
    // Skip approval check for iotistic/* namespace (internal images)
    const isInternalImage = imageInfo.imageName.startsWith('iotistic/') || 
                           imageInfo.imageName.startsWith('ghcr.io/dsamborschi/');
    
    if (!isInternalImage) {
      console.log(`[Webhook] Checking approval status for public image: ${imageInfo.imageName}`);
      
      // Extract base image name (remove registry prefix if present)
      const baseImageName = imageInfo.imageName.replace(/^docker\.io\//, '');
      
      const approvalCheck = await pool.query(
        `SELECT i.id, i.image_name, i.approval_status, i.category
         FROM images i
         WHERE i.image_name = $1 
           AND i.registry = $2`,
        [baseImageName, imageInfo.registry]
      );

      if (approvalCheck.rows.length === 0) {
        console.log(`[Webhook] ⚠️  Image not found in approved registry: ${baseImageName}`);
        
        // Create approval request for admin review
        await pool.query(
          `INSERT INTO image_approval_requests 
           (image_name, registry, requested_by, status, notes)
           VALUES ($1, $2, 'webhook-system', 'pending', $3)
           ON CONFLICT DO NOTHING`,
          [
            baseImageName,
            imageInfo.registry,
            `Automatic approval request from webhook for tag ${imageInfo.newTag}`
          ]
        );

        return res.status(403).json({
          error: 'Image not approved',
          message: `Image "${baseImageName}" is not in the approved registry. An approval request has been created.`,
          image: imageInfo.imageName,
          tag: imageInfo.newTag,
          action_required: 'Admin must approve this image before deployment',
        });
      }

      const imageRecord = approvalCheck.rows[0];

      if (imageRecord.approval_status !== 'approved') {
        console.log(`[Webhook] ⚠️  Image not approved: ${baseImageName} (status: ${imageRecord.approval_status})`);
        return res.status(403).json({
          error: 'Image not approved',
          message: `Image "${baseImageName}" has status: ${imageRecord.approval_status}`,
          image: imageInfo.imageName,
          tag: imageInfo.newTag,
          current_status: imageRecord.approval_status,
        });
      }

      // Check if specific tag is approved
      const tagCheck = await pool.query(
        `SELECT id, tag, is_recommended, is_deprecated
         FROM image_tags
         WHERE image_id = $1 AND tag = $2`,
        [imageRecord.id, imageInfo.newTag]
      );

      if (tagCheck.rows.length === 0) {
        console.log(`[Webhook] ⚠️  Tag not found in approved list: ${imageInfo.newTag}`);
        
        // Auto-add tag for approved images (admin can review later)
        await pool.query(
          `INSERT INTO image_tags 
           (image_id, tag, pushed_at, is_recommended)
           VALUES ($1, $2, CURRENT_TIMESTAMP, false)`,
          [imageRecord.id, imageInfo.newTag]
        );

        console.log(`[Webhook] ✅ Auto-added tag ${imageInfo.newTag} to approved image ${baseImageName}`);
      } else {
        const tagRecord = tagCheck.rows[0];
        
        if (tagRecord.is_deprecated) {
          console.log(`[Webhook] ⚠️  Tag is marked as deprecated: ${imageInfo.newTag}`);
          return res.status(403).json({
            error: 'Tag deprecated',
            message: `Tag "${imageInfo.newTag}" for image "${baseImageName}" is marked as deprecated`,
            image: imageInfo.imageName,
            tag: imageInfo.newTag,
            is_deprecated: true,
          });
        }

        console.log(`[Webhook] ✅ Tag approved: ${imageInfo.newTag} (recommended: ${tagRecord.is_recommended})`);
      }

      console.log(`[Webhook] ✅ Image approved for deployment: ${baseImageName}:${imageInfo.newTag}`);
    } else {
      console.log(`[Webhook] Skipping approval check for internal image: ${imageInfo.imageName}`);
    }

    // Create ImageUpdateManager
    const eventPublisher = new EventPublisher('webhook');
    const imageUpdateManager = new ImageUpdateManager(pool, eventPublisher);

    // Publish webhook received event
    await eventPublisher.publish(
      'image.webhook_received',
      'webhook',
      crypto.randomUUID(),
      {
        image_name: imageInfo.imageName,
        new_tag: imageInfo.newTag,
        registry: imageInfo.registry,
        policy_id: policy.id,
        webhook_payload: req.body,
      }
    );

    // Find current tag used by devices
    // Extract tag from image strings like "nginx:alpine" or "iotistic/agent:v1.0.0"
    // Note: Some services use config.image, others use imageName field directly
    const currentTagQuery = await pool.query(
      `SELECT DISTINCT 
         COALESCE(
           split_part(service->'config'->>'image', ':', 2),
           split_part(service->>'imageName', ':', 2)
         ) as current_tag
       FROM device_target_state ts,
       jsonb_each(ts.apps) as app(key, value),
       jsonb_array_elements(value->'services') as service
       WHERE (
         service->'config'->>'image' LIKE $1 || '%' OR
         service->>'imageName' LIKE $1 || '%'
       )
       LIMIT 1`,
      [imageInfo.imageName]
    );

    const oldTag = currentTagQuery.rows[0]?.current_tag || 'latest';

    // Create rollout
    const rolloutId = await imageUpdateManager.createRollout({
      imageName: imageInfo.imageName,
      oldTag: oldTag,
      newTag: imageInfo.newTag,
      registry: imageInfo.registry,
      strategy: policy.update_strategy,
      policyId: policy.id,
      filters: {
        fleet_id: policy.filter_fleet_id,
        device_tags: policy.filter_device_tags,
        device_uuids: policy.filter_device_uuids,
      },
      webhookPayload: req.body,
    });

    console.log(`[Webhook] Rollout created: ${rolloutId}`);

    // Start rollout (schedule batch 1 and update target state)
    await imageUpdateManager.startRollout(rolloutId);
    console.log(`[Webhook] Started rollout: ${rolloutId} (strategy: ${policy.update_strategy})`);
    
    // Note: RolloutMonitor will handle batch progression for staged rollouts

    return res.status(200).json({
      message: 'Webhook processed successfully',
      rollout_id: rolloutId,
      strategy: policy.update_strategy,
      image: imageInfo.imageName,
      tag: imageInfo.newTag,
    });

  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/webhooks/docker-registry/test
 * 
 * Test endpoint to verify webhook is working
 */
router.get('/docker-registry/test', (req: Request, res: Response) => {
  res.json({
    message: 'Webhook endpoint is active',
    config: {
      signature_verification: imageUpdateConfig.VERIFY_WEBHOOK_SIGNATURE,
      has_secret: !!imageUpdateConfig.WEBHOOK_SECRET,
    },
  });
});

export default router;
