/**
 * RETRY MANAGER
 * ==============
 * 
 * Implements Kubernetes-style exponential backoff for failed operations
 * Similar to ImagePullBackOff behavior
 */

export interface RetryState {
	count: number;
	nextRetry: Date;
	lastError: string;
}

export class RetryManager {
	private retryState = new Map<string, RetryState>();
	
	private readonly MAX_RETRIES = 10;
	
	// Exponential backoff intervals (similar to K8s)
	private readonly BACKOFF_INTERVALS = [
		10 * 1000,    // 10s
		20 * 1000,    // 20s
		40 * 1000,    // 40s
		80 * 1000,    // 1m 20s
		160 * 1000,   // 2m 40s
		300 * 1000,   // 5m (max backoff)
	];
	
	/**
	 * Check if we should retry an operation
	 */
	public shouldRetry(key: string): boolean {
		const state = this.retryState.get(key);
		
		// First attempt - always allow
		if (!state) {
			return true;
		}
		
		// Max retries exceeded
		if (state.count >= this.MAX_RETRIES) {
			return false;
		}
		
		// Check if enough time has passed since last failure
		return new Date() >= state.nextRetry;
	}
	
	/**
	 * Record a failure and calculate next retry time
	 */
	public recordFailure(key: string, error: string): void {
		const state = this.retryState.get(key) || {
			count: 0,
			nextRetry: new Date(),
			lastError: ''
		};
		
		state.count++;
		state.lastError = error;
		
		// Calculate backoff interval (capped at max)
		const backoffIndex = Math.min(state.count - 1, this.BACKOFF_INTERVALS.length - 1);
		const backoffMs = this.BACKOFF_INTERVALS[backoffIndex];
		
		state.nextRetry = new Date(Date.now() + backoffMs);
		
		this.retryState.set(key, state);
		
		console.log(`⏰ Retry scheduled for ${key}:`);
		console.log(`   Attempt: ${state.count}/${this.MAX_RETRIES}`);
		console.log(`   Next retry in: ${backoffMs / 1000}s`);
		console.log(`   Next retry at: ${state.nextRetry.toISOString()}`);
	}
	
	/**
	 * Record a success (clears retry state)
	 */
	public recordSuccess(key: string): void {
		const state = this.retryState.get(key);
		if (state && state.count > 0) {
			console.log(`✅ Retry succeeded for ${key} after ${state.count} attempt(s)`);
		}
		this.retryState.delete(key);
	}
	
	/**
	 * Get retry state for a key
	 */
	public getState(key: string): RetryState | undefined {
		return this.retryState.get(key);
	}
	
	/**
	 * Check if max retries exceeded
	 */
	public isMaxRetriesExceeded(key: string): boolean {
		const state = this.retryState.get(key);
		return state ? state.count >= this.MAX_RETRIES : false;
	}
	
	/**
	 * Get all retry states (for reporting)
	 */
	public getAllStates(): Map<string, RetryState> {
		return new Map(this.retryState);
	}
	
	/**
	 * Clear retry state for a specific key
	 */
	public clearState(key: string): void {
		this.retryState.delete(key);
	}
	
	/**
	 * Clear all retry states
	 */
	public clearAllStates(): void {
		this.retryState.clear();
	}
}
