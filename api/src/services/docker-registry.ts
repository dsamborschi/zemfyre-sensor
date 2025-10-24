/**
 * Docker Registry API Service
 * 
 * Resolves Docker image tags to digests by querying container registries.
 * This allows the system to detect when :latest or other floating tags
 * point to new images, triggering automatic updates.
 * 
 * Supports:
 * - Docker Hub (public and private)
 * - GitHub Container Registry (ghcr.io)
 * - Google Container Registry (gcr.io)
 * - AWS ECR
 * - Azure Container Registry
 * - Private registries
 */

interface ImageReference {
  registry: string;
  repository: string;
  tag: string;
  original: string;
}

interface ResolvedImage {
  imageName: string;      // Original tag-based reference
  digest: string;         // Resolved digest (sha256:...)
  resolvedAt: Date;       // When resolved
  registry: string;       // Registry used
}

/**
 * Parse Docker image reference into components
 * Examples:
 *   nginx:latest -> { registry: 'docker.io', repository: 'library/nginx', tag: 'latest' }
 *   ghcr.io/owner/repo:v1.0 -> { registry: 'ghcr.io', repository: 'owner/repo', tag: 'v1.0' }
 *   myregistry.com:5000/app:dev -> { registry: 'myregistry.com:5000', repository: 'app', tag: 'dev' }
 */
function parseImageReference(imageName: string): ImageReference {
  const original = imageName;
  
  // Check if contains registry (has domain or port)
  const parts = imageName.split('/');
  let registry = 'docker.io';
  let remainder = imageName;
  
  // First part contains '.' or ':' or is known registry -> it's a registry
  if (parts.length > 1 && (parts[0].includes('.') || parts[0].includes(':') || 
      ['localhost', 'ghcr.io', 'gcr.io', 'quay.io'].includes(parts[0]))) {
    registry = parts[0];
    remainder = parts.slice(1).join('/');
  }
  
  // Split repository and tag
  const tagSplit = remainder.split(':');
  let repository = tagSplit[0];
  let tag = tagSplit[1] || 'latest';
  
  // Docker Hub library images (e.g., nginx -> library/nginx)
  if (registry === 'docker.io' && !repository.includes('/')) {
    repository = `library/${repository}`;
  }
  
  return { registry, repository, tag, original };
}

/**
 * Resolve image tag to digest using Docker Registry HTTP API v2
 * 
 * This performs a HEAD request to the registry manifest endpoint to get the digest
 * without downloading the actual image layers.
 * 
 * @param imageName - Image reference (e.g., nginx:latest, ghcr.io/owner/repo:v1.0)
 * @param credentials - Optional registry credentials { username, password }
 * @returns Resolved image with digest
 */
export async function resolveImageDigest(
  imageName: string,
  credentials?: { username?: string; password?: string }
): Promise<ResolvedImage> {
  const ref = parseImageReference(imageName);
  
  try {
    // Determine registry API URL
    let registryUrl: string;
    if (ref.registry === 'docker.io') {
      registryUrl = 'https://registry-1.docker.io';
    } else if (ref.registry.startsWith('http://') || ref.registry.startsWith('https://')) {
      registryUrl = ref.registry;
    } else {
      registryUrl = `https://${ref.registry}`;
    }
    
    // Build manifest URL
    const manifestUrl = `${registryUrl}/v2/${ref.repository}/manifests/${ref.tag}`;
    
    // Prepare headers
    const headers: Record<string, string> = {
      // Request manifest v2 schema 2 (contains digest)
      'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
    };
    
    // Add authentication if provided
    if (credentials?.username && credentials?.password) {
      const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    
    // Docker Hub requires token-based auth for public images
    if (ref.registry === 'docker.io' && !credentials) {
      const token = await getDockerHubToken(ref.repository);
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Fetch manifest (HEAD request to get digest from header)
    const response = await fetch(manifestUrl, {
      method: 'HEAD',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}: ${response.statusText}`);
    }
    
    // Docker-Content-Digest header contains the sha256 digest
    const digest = response.headers.get('Docker-Content-Digest');
    
    if (!digest) {
      throw new Error('Registry did not return Docker-Content-Digest header');
    }
    
    return {
      imageName: ref.original,
      digest,
      resolvedAt: new Date(),
      registry: ref.registry
    };
    
  } catch (error: any) {
    // If resolution fails, log warning and return original tag
    // This allows the system to continue working even if registry is unreachable
    console.warn(`⚠️  Failed to resolve digest for ${imageName}: ${error.message}`);
    console.warn(`   Falling back to tag-based comparison (updates won't be detected for :latest tags)`);
    
    return {
      imageName: ref.original,
      digest: '', // Empty digest signals fallback to tag comparison
      resolvedAt: new Date(),
      registry: ref.registry
    };
  }
}

/**
 * Get Docker Hub authentication token for public images
 * Docker Hub requires token-based auth even for public images
 */
async function getDockerHubToken(repository: string): Promise<string> {
  const authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
  
  const response = await fetch(authUrl);
  if (!response.ok) {
    throw new Error(`Failed to get Docker Hub token: ${response.status}`);
  }
  
  const data = await response.json() as { token: string };
  return data.token;
}

/**
 * Resolve digests for all images in an app configuration
 * 
 * Walks through the apps object and resolves each service's image to a digest.
 * Updates the imageName field to include @sha256:... digest.
 * 
 * @param apps - Apps object from target state
 * @param credentials - Optional registry credentials
 * @returns Apps object with resolved digests
 */
export async function resolveAppsImages(
  apps: Record<number, any>,
  credentials?: { username?: string; password?: string }
): Promise<Record<number, any>> {
  const resolvedApps = { ...apps };
  
  for (const appId in resolvedApps) {
    const app = resolvedApps[appId];
    
    if (!app.services || !Array.isArray(app.services)) {
      continue;
    }
    
    for (const service of app.services) {
      const imageName = service.imageName || service.image;
      
      if (!imageName) {
        continue;
      }
      
      // Skip if already using digest (@sha256:...)
      if (imageName.includes('@sha256:')) {
        console.log(`   ✓ ${imageName} (already digest-based)`);
        continue;
      }
      
      // Resolve tag to digest
      console.log(`   🔍 Resolving ${imageName}...`);
      const resolved = await resolveImageDigest(imageName, credentials);
      
      if (resolved.digest) {
        // Update service to use digest reference
        // Format: repository@sha256:abc123...
        const imageWithoutTag = imageName.split(':')[0];
        const digestReference = `${imageWithoutTag}@${resolved.digest}`;
        
        service.imageName = digestReference;
        if (service.config?.image) {
          service.config.image = digestReference;
        }
        
        console.log(`   ✓ ${imageName} -> ${resolved.digest.substring(0, 19)}...`);
      } else {
        console.log(`   ⚠️  ${imageName} (digest resolution failed, using tag)`);
      }
    }
  }
  
  return resolvedApps;
}

/**
 * Check if image reference is digest-based or tag-based
 */
export function isDigestReference(imageName: string): boolean {
  return imageName.includes('@sha256:');
}

/**
 * Extract original tag from digest reference
 * Example: nginx@sha256:abc123 -> nginx:latest (requires lookup)
 * 
 * Note: This is lossy - we can't recover the original tag from just the digest.
 * The tag should be stored separately if needed for display purposes.
 */
export function extractImageName(imageReference: string): string {
  if (imageReference.includes('@')) {
    return imageReference.split('@')[0];
  }
  return imageReference.split(':')[0];
}
