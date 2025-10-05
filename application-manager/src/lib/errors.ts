/**
 * Common Error Utilities
 */

export class InternalInconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InternalInconsistencyError';
  }
}

export function isNotFoundError(error: any): boolean {
  return error?.statusCode === 404 || error?.code === 'ENOENT' || error?.message?.includes('not found');
}
