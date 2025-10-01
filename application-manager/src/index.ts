/**
 * Main entry point for standalone application manager
 */

export * from './container-manager';

// Re-export the default export as a named export
import ContainerManager from './container-manager';
export default ContainerManager;
