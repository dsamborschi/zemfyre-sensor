/**
 * SYSTEM METRICS MODULE
 * ======================
 * 
 * Simplified version of balena-supervisor system-info module
 * Collects hardware metrics from the device running container-manager
 * 
 * Adapted from: src/lib/system-info.ts
 */

import systeminformation from 'systeminformation';
import { promises as fs } from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessInfo {
	pid: number;
	name: string;
	cpu: number;
	mem: number;
	command: string;
}

export interface SystemMetrics {
	// CPU metrics
	cpu_usage: number;
	cpu_temp: number | null;
	cpu_cores: number;
	
	// Memory metrics
	memory_usage: number;
	memory_total: number;
	memory_percent: number;
	
	// Storage metrics
	storage_usage: number | null;
	storage_total: number | null;
	storage_percent: number | null;
	
	// System info
	uptime: number;
	hostname: string;
	
	// Health checks
	is_undervolted: boolean;
	
	// Process info
	top_processes: ProcessInfo[];
	
	// Timestamp
	timestamp: Date;
}

// ============================================================================
// CPU METRICS
// ============================================================================

/**
 * Get average CPU usage across all cores (0-100)
 */
export async function getCpuUsage(): Promise<number> {
	try {
		const cpuData = await systeminformation.currentLoad();
		const totalLoad = cpuData.cpus.reduce((sum, cpu) => sum + cpu.load, 0);
		return Math.round(totalLoad / cpuData.cpus.length);
	} catch (error) {
		console.error('Failed to get CPU usage:', error);
		return 0;
	}
}

/**
 * Get CPU temperature in Celsius
 * Returns null if temperature sensor not available
 */
export async function getCpuTemp(): Promise<number | null> {
	try {
		const tempInfo = await systeminformation.cpuTemperature();
		return tempInfo.main > 0 ? Math.round(tempInfo.main) : null;
	} catch (error) {
		return null;
	}
}

/**
 * Get number of CPU cores
 */
export async function getCpuCores(): Promise<number> {
	try {
		const cpuInfo = await systeminformation.cpu();
		return cpuInfo.cores;
	} catch (error) {
		return 1;
	}
}

// ============================================================================
// MEMORY METRICS
// ============================================================================

/**
 * Get memory usage information
 */
export async function getMemoryInfo(): Promise<{
	used: number;
	total: number;
	percent: number;
}> {
	try {
		const mem = await systeminformation.mem();
		// Exclude cached and buffers from used memory (like balena does)
		const usedMb = bytesToMb(mem.used - mem.cached - mem.buffers);
		const totalMb = bytesToMb(mem.total);
		const percent = Math.round((usedMb / totalMb) * 100);
		
		return {
			used: usedMb,
			total: totalMb,
			percent,
		};
	} catch (error) {
		console.error('Failed to get memory info:', error);
		return { used: 0, total: 0, percent: 0 };
	}
}

// ============================================================================
// STORAGE METRICS
// ============================================================================

/**
 * Get storage usage information
 * Looks for /data partition or falls back to root
 */
export async function getStorageInfo(): Promise<{
	used: number | null;
	total: number | null;
	percent: number | null;
}> {
	try {
		const fsInfo = await systeminformation.fsSize();
		
		// Look for /data partition first (like balena)
		let targetPartition = fsInfo.find(fs => fs.mount === '/data');
		
		// Fallback to root if no /data partition
		if (!targetPartition) {
			targetPartition = fsInfo.find(fs => fs.mount === '/');
		}
		
		if (!targetPartition) {
			return { used: null, total: null, percent: null };
		}
		
		return {
			used: bytesToMb(targetPartition.used),
			total: bytesToMb(targetPartition.size),
			percent: Math.round(targetPartition.use),
		};
	} catch (error) {
		console.error('Failed to get storage info:', error);
		return { used: null, total: null, percent: null };
	}
}

// ============================================================================
// SYSTEM INFO
// ============================================================================

/**
 * Get system uptime in seconds
 */
export async function getUptime(): Promise<number> {
	try {
		const timeInfo = await systeminformation.time();
		return timeInfo.uptime;
	} catch (error) {
		return 0;
	}
}

/**
 * Get system hostname
 */
export async function getHostname(): Promise<string> {
	try {
		const osInfo = await systeminformation.osInfo();
		return osInfo.hostname;
	} catch (error) {
		return 'unknown';
	}
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check if system has detected undervoltage (Raspberry Pi)
 * Scans dmesg for undervoltage warnings
 */
export async function isUndervolted(): Promise<boolean> {
	try {
		const { stdout } = await exec('dmesg');
		const undervoltageRegex = /under.*voltage/i;
		return undervoltageRegex.test(stdout);
	} catch (error) {
		// dmesg requires root, so this might fail
		return false;
	}
}

// ============================================================================
// PROCESS METRICS
// ============================================================================

/**
 * Get top 10 processes by CPU and memory usage
 * Returns combined list sorted by resource usage
 */
export async function getTopProcesses(): Promise<ProcessInfo[]> {
	try {
		const processes = await systeminformation.processes();
		
		// Filter out kernel threads and system processes with 0 CPU/memory
		const userProcesses = processes.list.filter(proc => 
			(proc.cpu > 0 || proc.mem > 0) && proc.name !== ''
		);
		
		// Sort by combined CPU and memory score (weighted)
		// CPU gets 60% weight, memory gets 40% weight
		const sortedProcesses = userProcesses.sort((a, b) => {
			const scoreA = (a.cpu * 0.6) + (a.mem * 0.4);
			const scoreB = (b.cpu * 0.6) + (b.mem * 0.4);
			return scoreB - scoreA;
		});
		
		// Take top 10
		const topProcs = sortedProcesses.slice(0, 10);
		
		// Format for our interface
		return topProcs.map(proc => ({
			pid: proc.pid,
			name: proc.name,
			cpu: Math.round(proc.cpu * 10) / 10, // Round to 1 decimal
			mem: Math.round(proc.mem * 10) / 10, // Round to 1 decimal
			command: proc.command || proc.name,
		}));
	} catch (error) {
		console.error('Failed to get top processes:', error);
		return [];
	}
}

// ============================================================================
// MAIN METRICS FUNCTION
// ============================================================================

/**
 * Get all system metrics in one call
 * This is the main function to use
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
	// Gather all metrics in parallel for speed
	const [
		cpuUsage,
		cpuTemp,
		cpuCores,
		memoryInfo,
		storageInfo,
		uptime,
		hostname,
		undervolted,
		topProcesses,
	] = await Promise.all([
		getCpuUsage(),
		getCpuTemp(),
		getCpuCores(),
		getMemoryInfo(),
		getStorageInfo(),
		getUptime(),
		getHostname(),
		isUndervolted(),
		getTopProcesses(),
	]);

	return {
		// CPU
		cpu_usage: cpuUsage,
		cpu_temp: cpuTemp,
		cpu_cores: cpuCores,
		
		// Memory
		memory_usage: memoryInfo.used,
		memory_total: memoryInfo.total,
		memory_percent: memoryInfo.percent,
		
		// Storage
		storage_usage: storageInfo.used,
		storage_total: storageInfo.total,
		storage_percent: storageInfo.percent,
		
		// System
		uptime,
		hostname,
		
		// Health
		is_undervolted: undervolted,
		
		// Processes
		top_processes: topProcesses,
		
		// Metadata
		timestamp: new Date(),
	};
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert bytes to megabytes
 */
function bytesToMb(bytes: number): number {
	return Math.floor(bytes / 1024 / 1024);
}

/**
 * Format uptime to human readable string
 */
export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	
	return parts.length > 0 ? parts.join(' ') : '0m';
}
