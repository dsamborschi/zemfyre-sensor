/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from Docker Hub, GitHub Container Registry, etc.
 * for automated image update notifications.
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import poolWrapper from '../db/connection';
import { EventPublisher } from '../services/event-sourcing';


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




export default router;
