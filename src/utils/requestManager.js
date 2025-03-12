import { nanoid } from 'nanoid';

// Request cache with TTL
const requestCache = new Map();
const pendingRequests = new Map();

// Default cache TTL in milliseconds
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (increased from 1 minute)
const HEALTH_CHECK_TTL = 5 * 60 * 1000; // 5 minutes for health checks

// Track request frequency to prevent excessive calls
const requestTracker = {
  endpoints: {},
  lastCleanup: Date.now(),
  
  // Track a request to an endpoint
  track(endpoint) {
    const now = Date.now();
    
    // Clean up old data every minute
    if (now - this.lastCleanup > 60000) {
      this.cleanup();
      this.lastCleanup = now;
    }
    
    // Initialize endpoint tracking if needed
    if (!this.endpoints[endpoint]) {
      this.endpoints[endpoint] = {
        count: 0,
        timestamps: [],
        isThrottled: false,
        lastWarning: 0
      };
    }
    
    // Add current timestamp
    this.endpoints[endpoint].timestamps.push(now);
    this.endpoints[endpoint].count++;
    
    // Check for excessive requests (more than 10 in 1 second - increased from 5)
    const recentRequests = this.endpoints[endpoint].timestamps.filter(
      time => now - time < 1000
    );
    
    if (recentRequests.length > 10 && now - this.endpoints[endpoint].lastWarning > 5000) {
      console.warn(`Excessive requests detected to ${endpoint} (${recentRequests.length} in 1s). Throttling.`);
      this.endpoints[endpoint].isThrottled = true;
      this.endpoints[endpoint].lastWarning = now;
      
      // Auto-reset throttling after 10 seconds
      setTimeout(() => {
        this.endpoints[endpoint].isThrottled = false;
      }, 10000);
      
      return true; // Throttled
    }
    
    return this.endpoints[endpoint].isThrottled; // Return current throttle status
  },
  
  // Clean up old request data
  cleanup() {
    const now = Date.now();
    Object.keys(this.endpoints).forEach(endpoint => {
      // Keep only timestamps from the last minute
      this.endpoints[endpoint].timestamps = this.endpoints[endpoint].timestamps.filter(
        time => now - time < 60000
      );
    });
    this.lastCleanup = now;
  },
  
  // Check if an endpoint is currently throttled
  isThrottled(endpoint) {
    return this.endpoints[endpoint]?.isThrottled || false;
  }
};

/**
 * Generate a cache key for a request
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - Request parameters
 * @returns {string} Cache key
 */
const generateCacheKey = (endpoint, params = {}) => {
  return `${endpoint}:${JSON.stringify(params)}`;
};

/**
 * Make an optimized API request with caching, deduplication and rate limiting
 * @param {string} endpoint - The API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<any>} Response data
 */
export const optimizedRequest = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    params = {},
    headers = {},
    cacheTTL = DEFAULT_CACHE_TTL,
    bypassCache = false,
    retryCount = 2,
    retryDelay = 1000,
    priority = 'normal', // 'high', 'normal', 'low'
  } = options;
  
  // Calculate cache TTL based on endpoint type
  let effectiveCacheTTL = DEFAULT_CACHE_TTL;
  
  // Special handling for health checks - much longer cache time
  if (endpoint.includes('/health')) {
    effectiveCacheTTL = HEALTH_CHECK_TTL;
  }
  // Longer cache for resources
  else if (endpoint.includes('/resources')) {
    effectiveCacheTTL = 10 * 60 * 1000; // 10 minutes for resources
  }
  // Use provided cacheTTL if specified
  else if (cacheTTL) {
    effectiveCacheTTL = cacheTTL;
  }
  
  // Generate a unique request ID and cache key
  const requestId = nanoid();
  const cacheKey = generateCacheKey(endpoint, { method, params, body });
  
  // Check if this endpoint is being throttled due to excessive requests
  if (requestTracker.isThrottled(endpoint) && priority !== 'high') {
    console.log(`Request to ${endpoint} throttled due to excessive calls`);
    
    // For throttled endpoints, try to return cached data even if expired
    if (requestCache.has(cacheKey)) {
      const cachedData = requestCache.get(cacheKey);
      console.log(`Returning stale cached data for throttled endpoint: ${endpoint}`);
      return cachedData.data;
    }
    
    // If no cached data, throw error for non-critical requests
    if (priority === 'low') {
      throw new Error(`Request throttled: Too many requests to ${endpoint}`);
    }
    
    // For normal priority, wait before proceeding
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Track this request
  requestTracker.track(endpoint);
  
  // Check cache first (unless bypass is requested)
  if (!bypassCache && method === 'GET' && requestCache.has(cacheKey)) {
    const cachedData = requestCache.get(cacheKey);
    if (Date.now() - cachedData.timestamp < effectiveCacheTTL) {
      console.log(`Cache hit for ${endpoint}`);
      return cachedData.data;
    } else {
      console.log(`Cache expired for ${endpoint}`);
      requestCache.delete(cacheKey);
    }
  }
  
  // Check for pending identical requests to deduplicate
  if (pendingRequests.has(cacheKey)) {
    console.log(`Deduplicating request to ${endpoint}`);
    return pendingRequests.get(cacheKey);
  }
  
  // Create the actual request function
  const makeRequest = async (retryAttempt = 0) => {
    try {
      // Prepare request options
      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        ...(body && { body: JSON.stringify(body) })
      };
      
      // Build URL with query parameters
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      // Handle both absolute and relative URLs
      let url;
      if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
        // Absolute URL - use as is
        url = queryParams.toString() 
          ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryParams.toString()}`
          : endpoint;
      } else {
        // Relative URL - use as is
        url = queryParams.toString() 
          ? `${endpoint}?${queryParams.toString()}`
          : endpoint;
      }
      
      // Make the request
      const response = await fetch(url, requestOptions);
      
      // Handle non-OK responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }
      
      // Parse and return the response
      const data = await response.json();
      
      // Cache successful GET responses
      if (method === 'GET') {
        requestCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
      }
      
      return data;
    } catch (error) {
      // Retry logic for failed requests
      if (retryAttempt < retryCount) {
        console.log(`Retrying request to ${endpoint} (attempt ${retryAttempt + 1}/${retryCount})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryAttempt + 1)));
        return makeRequest(retryAttempt + 1);
      }
      
      // If we've exhausted retries, throw the error
      throw error;
    } finally {
      // Clean up the pending request
      if (retryAttempt === retryCount || retryAttempt === 0) {
        pendingRequests.delete(cacheKey);
      }
    }
  };
  
  // Store the promise in pending requests for deduplication
  const requestPromise = makeRequest();
  pendingRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
};

/**
 * Clear the request cache for specific endpoints or all
 * @param {string|null} endpoint - Specific endpoint to clear, or null for all
 */
export const clearRequestCache = (endpoint = null) => {
  if (endpoint) {
    // Clear cache for a specific endpoint
    for (const key of requestCache.keys()) {
      if (key.startsWith(`${endpoint}:`)) {
        requestCache.delete(key);
      }
    }
    console.log(`Cache cleared for endpoint: ${endpoint}`);
  } else {
    // Clear all cache
    requestCache.clear();
    console.log('Request cache fully cleared');
  }
};

/**
 * Batch multiple requests together
 * @param {Array<Object>} requests - Array of request configs
 * @returns {Promise<Array>} Array of responses
 */
export const batchRequests = async (requests) => {
  return Promise.all(
    requests.map(req => 
      optimizedRequest(req.endpoint, req.options)
    )
  );
};

/**
 * Health check with reduced frequency
 * @returns {Promise<boolean>} Connection status
 */
export const checkConnectionStatus = async () => {
  try {
    // Get Supabase URL from environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      console.warn('Missing VITE_SUPABASE_URL environment variable');
      return false;
    }
    
    // Use the full Supabase URL for the health check
    const healthCheckUrl = `${supabaseUrl}/auth/v1/health`;
    
    console.log(`Checking Supabase health at: ${healthCheckUrl}`);
    
    // Get the API key from environment variables
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    // Use fetch directly instead of optimizedRequest to have more control over response handling
    const response = await fetch(healthCheckUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      // Add cache busting to prevent cached responses
      cache: 'no-cache'
    });
    
    // Check if response is OK
    if (!response.ok) {
      console.warn(`Health check failed with status: ${response.status}`);
      
      // If unauthorized, we should still allow local mode to work
      if (response.status === 401) {
        console.warn('API key authentication failed. Switching to local mode.');
        localStorage.setItem('forceSupabaseConnection', 'false');
      }
      
      return false;
    }
    
    // Check content type to avoid parsing HTML as JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`Health check returned non-JSON content: ${contentType}`);
      return false;
    }
    
    // Now safely parse JSON
    const result = await response.json();
    return result && result.status === 'ok';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
};

export default {
  optimizedRequest,
  batchRequests,
  clearRequestCache,
  checkConnectionStatus
}; 