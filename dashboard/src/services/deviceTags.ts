/**
 * Device Tags API Service
 */

import { buildApiUrl } from '@/config/api';

export interface DeviceTag {
  key: string;
  value: string;
}

export interface DeviceTagsResponse {
  deviceUuid: string;
  tags: Record<string, string>;
}

export interface TagDefinition {
  id: number;
  key: string;
  description?: string;
  allowedValues?: string[];
  isRequired: boolean;
}

export interface TagKey {
  key: string;
  deviceCount: number;
}

export interface TagValue {
  value: string;
  deviceCount: number;
}

/**
 * Get all tags for a device
 */
export async function getDeviceTags(deviceUuid: string): Promise<Record<string, string>> {
  const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/tags`));
  
  if (!response.ok) {
    throw new Error('Failed to fetch device tags');
  }
  
  const data: DeviceTagsResponse = await response.json();
  return data.tags;
}

/**
 * Add or update a single tag
 */
export async function setDeviceTag(
  deviceUuid: string,
  key: string,
  value: string
): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/tags`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, value }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to add tag');
  }
}

/**
 * Delete a specific tag
 */
export async function deleteDeviceTag(
  deviceUuid: string,
  key: string
): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/tags/${key}`), {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete tag');
  }
}

/**
 * Replace all tags for a device
 */
export async function replaceDeviceTags(
  deviceUuid: string,
  tags: Record<string, string>
): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/v1/devices/${deviceUuid}/tags`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tags }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to replace tags');
  }
}

/**
 * Get all tag definitions
 */
export async function getTagDefinitions(): Promise<TagDefinition[]> {
  const response = await fetch(buildApiUrl('/api/v1/tags/definitions'));
  
  if (!response.ok) {
    throw new Error('Failed to fetch tag definitions');
  }
  
  const data = await response.json();
  return data.definitions;
}

/**
 * Get all unique tag keys
 */
export async function getTagKeys(): Promise<TagKey[]> {
  const response = await fetch(buildApiUrl('/api/v1/tags/keys'));
  
  if (!response.ok) {
    throw new Error('Failed to fetch tag keys');
  }
  
  const data = await response.json();
  return data.keys;
}

/**
 * Get all values for a specific tag key
 */
export async function getTagValues(key: string): Promise<TagValue[]> {
  const response = await fetch(buildApiUrl(`/api/v1/tags/values/${key}`));
  
  if (!response.ok) {
    throw new Error('Failed to fetch tag values');
  }
  
  const data = await response.json();
  return data.values;
}
