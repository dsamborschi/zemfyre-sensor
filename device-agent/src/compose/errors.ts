/**
 * Compose-specific errors
 */

export class ResourceRecreationAttemptError extends Error {
	constructor(resourceType: string, resourceName: string) {
		super(
			`Attempting to recreate ${resourceType} '${resourceName}', but it already exists with different configuration. ` +
			`Resource recreation requires manual intervention.`
		);
		this.name = 'ResourceRecreationAttemptError';
	}
}
