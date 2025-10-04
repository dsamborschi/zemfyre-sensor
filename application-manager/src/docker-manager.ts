/**
 * DOCKER MANAGER
 * ==============
 * 
 * Real Docker integration for ContainerManager
 * Handles: pulling images, creating/starting/stopping/removing containers
 */

import Docker from 'dockerode';
import { SimpleService } from './container-manager';

export interface DockerContainerInfo {
	id: string;
	name: string;
	image: string;
	state: string; // "running", "exited", etc.
	status: string;
	labels: Record<string, string>;
	ports?: Docker.Port[];
}

export class DockerManager {
	private docker: Docker;

	constructor(dockerOptions?: Docker.DockerOptions) {
		// Default: connect to local Docker daemon
		this.docker = new Docker(dockerOptions || { socketPath: '/var/run/docker.sock' });
	}

	// ========================================================================
	// IMAGE OPERATIONS
	// ========================================================================

	/**
	 * Pull an image from registry
	 */
	async pullImage(imageName: string): Promise<void> {
		console.log(`    Pulling image: ${imageName}`);

		return new Promise((resolve, reject) => {
			this.docker.pull(imageName, (err: any, stream: NodeJS.ReadableStream) => {
				if (err) {
					console.error(`Failed to pull ${imageName}:`, err.message);
					return reject(err);
				}

				// Follow progress
				this.docker.modem.followProgress(
					stream,
					(err: any, output: any) => {
						if (err) {
							console.error(`Pull failed:`, err.message);
							return reject(err);
						}
						console.log(`    Successfully pulled ${imageName}`);
						resolve();
					},
					(event: any) => {
						// Progress events - can show download progress
						if (event.status === 'Downloading') {
							// Optional: show progress bar
						}
					},
				);
			});
		});
	}

	/**
	 * Check if image exists locally
	 */
	async hasImage(imageName: string): Promise<boolean> {
		try {
			const image = this.docker.getImage(imageName);
			await image.inspect();
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * List all local images
	 */
	async listImages(): Promise<Docker.ImageInfo[]> {
		return this.docker.listImages();
	}

	// ========================================================================
	// CONTAINER OPERATIONS
	// ========================================================================

	/**
	 * Create and start a container from a service definition
	 */
	async startContainer(service: SimpleService): Promise<string> {
		console.log(`    Starting container: ${service.serviceName}`);

		try {
			// 1. Ensure image exists (pull if needed)
			const hasImage = await this.hasImage(service.imageName);
			if (!hasImage) {
				console.log(`    Image not found locally, pulling...`);
				await this.pullImage(service.imageName);
			}

			// 2. Parse port bindings
			const portBindings: Docker.PortMap = {};
			const exposedPorts: { [port: string]: {} } = {};

			if (service.config.ports) {
				for (const portMapping of service.config.ports) {
					// Ensure portMapping is a string
					const portStr = typeof portMapping === 'string' ? portMapping : String(portMapping);
					
					if (!portStr || typeof portStr.split !== 'function') {
						console.error(`Invalid port mapping format: ${JSON.stringify(portMapping)}`);
						continue;
					}
					
					const [hostPort, containerPort] = portStr.split(':');
					
					if (!hostPort || !containerPort) {
						console.error(`Invalid port mapping (missing host or container port): ${portStr}`);
						continue;
					}
					
					const port = `${containerPort}/tcp`;
					exposedPorts[port] = {};
					portBindings[port] = [{ HostPort: hostPort }];
				}
			}

			// 3. Parse volume bindings
			const binds: string[] = [];
			if (service.config.volumes) {
				for (const volume of service.config.volumes) {
					// Format: "host-path:/container-path" or "volume-name:/container-path"
					binds.push(volume);
				}
			}

			// 4. Build container configuration
			const containerName = `${service.appName}_${service.serviceName}_${service.serviceId}`;

			const createOptions: Docker.ContainerCreateOptions = {
				name: containerName,
				Image: service.imageName,
				Env: service.config.environment
					? Object.entries(service.config.environment).map(
							([key, value]) => `${key}=${value}`,
					  )
					: [],
				ExposedPorts: exposedPorts,
				HostConfig: {
					PortBindings: portBindings,
					Binds: binds.length > 0 ? binds : undefined,
					NetworkMode: service.config.networkMode || 'bridge',
					RestartPolicy: {
						Name: service.config.restart || 'unless-stopped',
						MaximumRetryCount: 0,
					},
				},
				Labels: {
					'iotistic.app-id': service.appId.toString(),
					'iotistic.app-name': service.appName,
					'iotistic.service-id': service.serviceId.toString(),
					'iotistic.service-name': service.serviceName,
					...(service.config.labels || {}),
				},
			};

			// 5. Create container
			const container = await this.docker.createContainer(createOptions);
			const containerId = container.id;

			// 6. Start container
			await container.start();

			console.log(`    Container started: ${containerId.substring(0, 12)}`);
			return containerId;
		} catch (error: any) {
			console.error(`    Failed to start container:`, error.message);
			throw error;
		}
	}

	/**
	 * Stop a running container
	 */
	async stopContainer(containerId: string, timeout: number = 10): Promise<void> {
		console.log(`    Stopping container: ${containerId.substring(0, 12)}`);

		try {
			const container = this.docker.getContainer(containerId);
			await container.stop({ t: timeout });
			console.log(`    Container stopped`);
		} catch (error: any) {
			// Container might already be stopped
			if (error.statusCode === 304) {
				console.log(`    Container already stopped`);
			} else {
				console.error(`    Failed to stop container:`, error.message);
				throw error;
			}
		}
	}

	/**
	 * Remove a container
	 */
	async removeContainer(containerId: string, force: boolean = false): Promise<void> {
		console.log(`    Removing container: ${containerId.substring(0, 12)}`);

		try {
			const container = this.docker.getContainer(containerId);
			await container.remove({ force });
			console.log(`    Container removed`);
		} catch (error: any) {
			// Container might already be removed
			if (error.statusCode === 404) {
				console.log(`    Container already removed`);
			} else {
				console.error(`    Failed to remove container:`, error.message);
				throw error;
			}
		}
	}

	/**
	 * Get container information
	 */
	async inspectContainer(containerId: string): Promise<Docker.ContainerInspectInfo> {
		const container = this.docker.getContainer(containerId);
		return container.inspect();
	}

	/**
	 * List all containers (running and stopped)
	 */
	async listContainers(all: boolean = true): Promise<Docker.ContainerInfo[]> {
		return this.docker.listContainers({ all });
	}

	/**
	 * List containers managed by our app (filtered by labels)
	 */
	async listManagedContainers(): Promise<DockerContainerInfo[]> {
		const containers = await this.docker.listContainers({
			all: true,
			filters: {
				label: ['iotistic.app-id'],
			},
		});

		return containers.map((c) => ({
			id: c.Id,
			name: c.Names[0]?.replace(/^\//, '') || '',
			image: c.Image,
			state: c.State,
			status: c.Status,
			labels: c.Labels,
			ports: c.Ports || [],
		}));
	}

	/**
	 * Get container logs
	 */
	async getContainerLogs(
		containerId: string,
		tail: number = 100,
	): Promise<string> {
		const container = this.docker.getContainer(containerId);
		const logs = await container.logs({
			stdout: true,
			stderr: true,
			tail,
			timestamps: true,
		});
		return logs.toString();
	}

	// ========================================================================
	// NETWORK OPERATIONS (OPTIONAL)
	// ========================================================================

	/**
	 * Create a Docker network
	 */
	async createNetwork(name: string): Promise<Docker.Network> {
		console.log(`    Creating network: ${name}`);
		const network = await this.docker.createNetwork({
			Name: name,
			Driver: 'bridge',
			Labels: {
				'iotistic.managed': 'true',
			},
		});
		console.log(`    Network created`);
		return network;
	}

	/**
	 * List all networks
	 */
	async listNetworks(): Promise<Docker.NetworkInspectInfo[]> {
		return this.docker.listNetworks();
	}

	/**
	 * Remove a network
	 */
	async removeNetwork(networkId: string): Promise<void> {
		console.log(`    Removing network: ${networkId}`);
		const network = this.docker.getNetwork(networkId);
		await network.remove();
		console.log(`    Network removed`);
	}

	// ========================================================================
	// VOLUME OPERATIONS (OPTIONAL)
	// ========================================================================

	/**
	 * Create a Docker volume
	 */
	async createVolume(name: string): Promise<Docker.VolumeCreateResponse> {
		console.log(`    Creating volume: ${name}`);
		const volume = await this.docker.createVolume({
			Name: name,
			Labels: {
				'iotistic.managed': 'true',
			},
		});
		console.log(`    Volume created`);
		return volume;
	}

	/**
	 * List all volumes
	 */
	async listVolumes(): Promise<Docker.VolumeInspectInfo[]> {
		const result = await this.docker.listVolumes();
		return result.Volumes;
	}

	/**
	 * Remove a volume
	 */
	async removeVolume(volumeName: string, force: boolean = false): Promise<void> {
		console.log(`    Removing volume: ${volumeName}`);
		const volume = this.docker.getVolume(volumeName);
		await volume.remove({ force });
		console.log(`    Volume removed`);
	}

	// ========================================================================
	// UTILITY
	// ========================================================================

	/**
	 * Check if Docker daemon is accessible
	 */
	async ping(): Promise<boolean> {
		try {
			await this.docker.ping();
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get Docker version info
	 */
	async getVersion(): Promise<any> {
		return this.docker.version();
	}

	/**
	 * Get Docker system info
	 */
	async getInfo(): Promise<any> {
		return this.docker.info();
	}

	/**
	 * Get the Docker instance (for advanced operations)
	 */
	public getDockerInstance(): Docker {
		return this.docker;
	}
}

export default DockerManager;
