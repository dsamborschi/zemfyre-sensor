/**
 * Docker Utils - Singleton Docker client
 */
import Docker from 'dockerode';

export const docker = new Docker({ socketPath: '/var/run/docker.sock' });
