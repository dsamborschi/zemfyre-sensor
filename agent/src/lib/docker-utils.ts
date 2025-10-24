/**
 * Docker Utils - Singleton Docker client
 */
import Docker from 'dockerode';

// Detect platform and use appropriate Docker socket
const getDockerSocketPath = (): string => {
	if (process.platform === 'win32') {
		// Windows: Docker Desktop uses named pipe
		return '//./pipe/docker_engine';
	} else {
		// Linux/Mac: Use Unix socket
		return '/var/run/docker.sock';
	}
};

export const docker = new Docker({ socketPath: getDockerSocketPath() });
