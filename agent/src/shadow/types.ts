import { z } from 'zod';

/**
 * Shadow State - represents the desired, reported, and delta states
 */
export interface ShadowState {
  desired?: Record<string, any>;
  reported?: Record<string, any>;
  delta?: Record<string, any>;
}

/**
 * Shadow Document - complete shadow representation
 */
export interface ShadowDocument {
  state?: ShadowState;
  metadata?: {
    desired?: Record<string, any>;
    reported?: Record<string, any>;
  };
  version?: number;
  timestamp?: number;
  clientToken?: string;
}

/**
 * Shadow Update Request
 */
export interface ShadowUpdateRequest {
  state?: {
    desired?: Record<string, any>;
    reported?: Record<string, any>;
  };
  clientToken?: string;
  version?: number;
}

/**
 * Shadow Update Response
 */
export interface ShadowUpdateResponse {
  state?: ShadowState;
  metadata?: Record<string, any>;
  version?: number;
  timestamp?: number;
  clientToken?: string;
}

/**
 * Shadow Error Response
 */
export interface ShadowErrorResponse {
  code: number;
  message: string;
  timestamp?: number;
  clientToken?: string;
}

/**
 * Shadow Delta Updated Event
 */
export interface ShadowDeltaUpdatedEvent {
  state?: Record<string, any>;
  metadata?: Record<string, any>;
  version?: number;
  timestamp?: number;
  clientToken?: string;
}

/**
 * Shadow Updated Event (from update/documents topic)
 */
export interface ShadowUpdatedEvent {
  previous?: {
    state?: ShadowState;
    metadata?: Record<string, any>;
    version?: number;
  };
  current?: ShadowDocument;
  timestamp?: number;
  clientToken?: string;
}

/**
 * Shadow Configuration Schema
 */
export const ShadowConfigSchema = z.object({
  enabled: z.boolean().default(false),
  shadowName: z.string().min(1),
  inputFile: z.string().optional(),
  outputFile: z.string().optional(),
  syncOnDelta: z.boolean().default(true),
  enableFileMonitor: z.boolean().default(false),
  publishInterval: z.number().min(1000).optional(), // Minimum 1 second
});

export type ShadowConfig = z.infer<typeof ShadowConfigSchema>;

/**
 * MQTT Connection interface for shadow operations
 */
export interface MqttConnection {
  publish(topic: string, payload: string | Buffer, qos?: 0 | 1 | 2): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2, handler?: (topic: string, payload: Buffer) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  isConnected(): boolean;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Shadow Topics - IoT Device Shadow MQTT topics
 * Uses the same convention as sensor-publish: $iot/device/{uuid}/...
 */
export class ShadowTopics {
  private readonly deviceUuid: string;
  private readonly shadowName: string;

  constructor(deviceUuid: string, shadowName: string) {
    this.deviceUuid = deviceUuid;
    this.shadowName = shadowName;
  }

  // Update topics
  public get update(): string {
    return `$iot/device/${this.deviceUuid}/shadow/name/${this.shadowName}/update`;
  }

  public get updateAccepted(): string {
    return `${this.update}/accepted`;
  }

  public get updateRejected(): string {
    return `${this.update}/rejected`;
  }

  public get updateDocuments(): string {
    return `${this.update}/documents`;
  }

  public get updateDelta(): string {
    return `${this.update}/delta`;
  }

  // Get topics
  public get get(): string {
    return `$iot/device/${this.deviceUuid}/shadow/name/${this.shadowName}/get`;
  }

  public get getAccepted(): string {
    return `${this.get}/accepted`;
  }

  public get getRejected(): string {
    return `${this.get}/rejected`;
  }

  // Delete topics
  public get delete(): string {
    return `$iot/device/${this.deviceUuid}/shadow/name/${this.shadowName}/delete`;
  }

  public get deleteAccepted(): string {
    return `${this.delete}/accepted`;
  }

  public get deleteRejected(): string {
    return `${this.delete}/rejected`;
  }

  /**
   * Get all subscription topics for shadow updates
   */
  public getSubscriptionTopics(): string[] {
    return [
      this.updateAccepted,
      this.updateRejected,
      this.updateDocuments,
      this.updateDelta,
      this.getAccepted,
      this.getRejected,
    ];
  }
}

/**
 * Shadow Statistics
 */
export interface ShadowStats {
  updatesPublished: number;
  updatesAccepted: number;
  updatesRejected: number;
  deltaEventsReceived: number;
  documentEventsReceived: number;
  getRequestsSent: number;
  lastUpdateTime?: Date;
  lastDeltaTime?: Date;
  lastErrorCode?: number;
  lastErrorMessage?: string;
}
