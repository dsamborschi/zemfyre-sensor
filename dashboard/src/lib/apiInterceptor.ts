/**
 * API Interceptor
 * 
 * Wraps the native fetch API to automatically track API usage metrics
 */

import { apiTrafficTracker } from './apiTrafficTracker';

// Store original fetch
const originalFetch = window.fetch;

// Override fetch with tracking
window.fetch = async function(...args: Parameters<typeof fetch>): Promise<Response> {
  const startTime = performance.now();
  const [url, options] = args;
  const method = options?.method || 'GET';
  
  try {
    const response = await originalFetch(...args);
    
    // Clone response to read body without consuming it
    const clonedResponse = response.clone();
    
    // Calculate metrics
    const endTime = performance.now();
    const duration = endTime - startTime;
    const status = response.status;
    
    // Estimate size from response
    let size = 0;
    try {
      const text = await clonedResponse.text();
      size = new Blob([text]).size;
    } catch (e) {
      // If we can't read the body, estimate from headers
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        size = parseInt(contentLength, 10);
      }
    }
    
    // Track the request with status
    const urlString = typeof url === 'string' ? url : url.toString();
    apiTrafficTracker.log(urlString, size, duration, method, status);
    
    return response;
  } catch (error) {
    // Track failed requests (network errors, timeouts)
    const endTime = performance.now();
    const duration = endTime - startTime;
    const urlString = typeof url === 'string' ? url : url.toString();
    // Status 0 indicates network failure
    apiTrafficTracker.log(urlString, 0, duration, method, 0);
    
    throw error;
  }
};

// Export function to restore original fetch if needed
export function restoreOriginalFetch() {
  window.fetch = originalFetch;
}
