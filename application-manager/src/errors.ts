/**
 * Custom Error Classes
 */

export class InvalidNetworkNameError extends Error {
  constructor(name: string) {
    super(`Invalid network name: ${name}`);
    this.name = 'InvalidNetworkNameError';
  }
}

export class ResourceRecreationAttemptError extends Error {
  constructor(resourceType: string, resourceName: string) {
    super(`Cannot recreate ${resourceType}: ${resourceName} (config change requires manual intervention)`);
    this.name = 'ResourceRecreationAttemptError';
  }
}
