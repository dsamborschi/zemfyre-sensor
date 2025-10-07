/**
 * Main entry point for standalone application manager
 */

export * from './compose/container-manager';

// Re-export the default export as a named export
import ContainerManager from './compose/container-manager';
export default ContainerManager;
