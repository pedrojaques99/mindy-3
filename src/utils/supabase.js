import { createClient } from '@supabase/supabase-js';
import { optimizedRequest, checkConnectionStatus } from './requestManager';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL environment variable');
}

if (!supabaseKey) {
  console.error('Missing VITE_SUPABASE_ANON_KEY environment variable');
}

// Connection check status
let connectionStatus = {
  lastChecked: 0,
  isConnected: null,
  checkInProgress: false
};

// Function to check Supabase connection status
export const checkSupabaseConnection = async (forceCheck = false) => {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (!isBrowser) {
    console.log('Not in browser environment, skipping connection check');
    return false;
  }

  // If a check is already in progress, wait for it to complete
  if (connectionStatus.checkInProgress) {
    // Wait for the current check to complete
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!connectionStatus.checkInProgress) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
    return connectionStatus.isConnected;
  }
  
  // If we've checked recently and not forcing a new check, return cached result
  const now = Date.now();
  if (!forceCheck && now - connectionStatus.lastChecked < 5 * 60 * 1000 && connectionStatus.isConnected !== null) {
    return connectionStatus.isConnected;
  }
  
  // Mark that we're checking
  connectionStatus.checkInProgress = true;
  
  try {
    // Simple direct query method to test the database connection
    // This is more reliable than checking the health API
    const startTime = performance.now();
    
    // First, try querying an existing table like 'resources'
    try {
      const { data, error } = await supabase
        .from('resources')
        .select('count')
        .limit(1)
        .single();
      
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      if (error && error.code === '42P01') {
        // 'resources' table doesn't exist, but connection works
        console.log(`Supabase connection successful (${responseTime}ms) - 'resources' table doesn't exist yet`);
        connectionStatus.isConnected = true;
        connectionStatus.lastChecked = now;
        return true;
      } else if (!error) {
        // Successful query
        console.log(`Supabase connection successful (${responseTime}ms) - Retrieved data from 'resources'`);
        connectionStatus.isConnected = true;
        connectionStatus.lastChecked = now;
        return true;
      }
    } catch (resourceError) {
      console.log('Error checking resources table:', resourceError);
      // Continue to fallback check
    }
    
    // Fallback: Try the dummy query that will always fail with a specific error
    const { error } = await supabase
      .from('_dummy_query_for_connection_test_')
      .select('*')
      .limit(1)
      .maybeSingle();
      
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);
    
    // If we get a "relation does not exist" error (code 42P01),
    // that actually means our connection is working! The table just doesn't exist.
    if (error && error.code === '42P01') {
      console.log(`Supabase connection successful (${responseTime}ms) - Expected 'relation does not exist' error`);
      connectionStatus.isConnected = true;
      connectionStatus.lastChecked = now;
      return true;
    }
    
    // Check for 404 errors that can happen during connection tests
    if (error && (error.status === 404 || error.code === '404')) {
      // 404 errors can sometimes happen on fresh Supabase installations
      // Let's test auth endpoints instead
      try {
        // Just check if we can access the auth API
        await supabase.auth.getSession();
        console.log(`Supabase connection successful (${responseTime}ms) - Auth API accessible`);
        connectionStatus.isConnected = true;
        connectionStatus.lastChecked = now;
        return true;
      } catch (authError) {
        console.log('Auth check also failed:', authError);
      }
    }
    
    // Any other error means there's a connection problem
    if (error) {
      console.error('Supabase connection failed:', error.message);
      connectionStatus.isConnected = false;
      connectionStatus.lastChecked = now;
      return false;
    }
    
    // No error means we actually have this dummy table (very unlikely)
    console.log(`Supabase connection successful (${responseTime}ms) - Dummy table exists!`);
    connectionStatus.isConnected = true;
    connectionStatus.lastChecked = now;
    return true;
  } catch (error) {
    console.error('Error checking Supabase connection:', error);
    connectionStatus.isConnected = false;
    connectionStatus.lastChecked = now;
    return false;
  } finally {
    connectionStatus.checkInProgress = false;
  }
};

// Create Supabase client with improved configuration
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'mindy-auth-storage'
  },
  global: {
    fetch: async (url, options = {}) => {
      // Extract the endpoint from the URL
      const endpoint = url.replace(supabaseUrl, '');
      
      // For health checks, use our optimized version
      if (endpoint.includes('/health')) {
        // Check if we've checked recently (within 5 minutes)
        const now = Date.now();
        if (now - connectionStatus.lastChecked < 5 * 60 * 1000 && connectionStatus.isConnected !== null) {
          // Return a mock response based on cached status
          return new Response(
            JSON.stringify({ status: connectionStatus.isConnected ? 'ok' : 'error' }),
            { 
              status: connectionStatus.isConnected ? 200 : 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        
        // If a check is already in progress, wait for it
        if (connectionStatus.checkInProgress) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return new Response(
            JSON.stringify({ status: connectionStatus.isConnected ? 'ok' : 'error' }),
            { 
              status: connectionStatus.isConnected ? 200 : 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        
        // Perform the check
        connectionStatus.checkInProgress = true;
        try {
          // Use the full URL for the health check
          const isConnected = await checkConnectionStatus();
          connectionStatus.isConnected = isConnected;
          connectionStatus.lastChecked = Date.now();
          
          return new Response(
            JSON.stringify({ status: isConnected ? 'ok' : 'error' }),
            { 
              status: isConnected ? 200 : 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        } finally {
          connectionStatus.checkInProgress = false;
        }
      }
      
      // Get the current session - needed for RLS policies
      const currentSession = supabase.auth.session?.();
      const authToken = currentSession?.access_token;
      
      // Fix: Explicitly include the API key and content-type in all requests
      const requestHeaders = {
        ...options.headers || {},
        'apikey': supabaseKey,
        'Authorization': authToken ? `Bearer ${authToken}` : `Bearer ${supabaseKey}`,
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      // For GET requests to common endpoints, use our optimized request manager
      if (options.method === 'GET' && 
          (endpoint.includes('/comments') || 
           endpoint.includes('/resources') || 
           endpoint.includes('/favorites'))) {
        try {
          // Use our optimized request function
          const data = await optimizedRequest(url, {
            method: options.method,
            headers: requestHeaders,
            body: options.body,
            cacheTTL: 60 * 1000 // 1 minute cache for these endpoints
          });
          
          // Create a mock Response object
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Error in optimized request:', error);
          // Fall through to regular fetch if optimized request fails
        }
      }
      
      // For other requests, use regular fetch with timeout
      const timeout = 30000; // 30 seconds
      const controller = new AbortController();
      const { signal } = controller;
      
      const timeoutId = setTimeout(() => {
        console.error(`Supabase request timeout after ${timeout}ms: ${endpoint}`);
        controller.abort();
      }, timeout);
      
      try {
        const response = await fetch(url, { 
          ...options, 
          signal,
          headers: requestHeaders
        });
        
        // Log any non-200 responses for debugging
        if (!response.ok) {
          console.warn(`Supabase request failed: ${response.status} ${response.statusText}`, {
            endpoint,
            status: response.status
          });
        }
        
        return response;
      } catch (error) {
        // Log network errors
        if (error.name === 'AbortError') {
          console.error('Supabase request aborted (timeout):', { endpoint });
        } else {
          console.error('Supabase fetch error:', error, { endpoint });
        }
        
        // Don't reject, return a mock response to prevent app crashes
        if (error.message === 'Failed to fetch') {
          console.log('Network error occurred. Creating fallback response.');
          // Create a mock Response object that indicates a network error
          return new Response(JSON.stringify({
            error: 'Network error',
            message: 'Failed to connect to Supabase server',
            status: 503
          }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'application/json'
            })
          });
        }
        
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  },
  // More detailed client logging
  debug: import.meta.env.DEV
});

// Helper function to execute a Supabase query with retry logic
export const executeWithRetry = async (queryFn, maxRetries = 3, delay = 1000) => {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      console.warn(`Supabase query failed (attempt ${attempt + 1}/${maxRetries}):`, error);
      lastError = error;
      
      // Determine if we should retry based on error type
      const shouldRetry = 
        // Network errors
        error.message === 'Failed to fetch' || 
        error.code === 'NETWORK_ERROR' ||
        // Database initialization errors
        error.code === '42P01' || // table does not exist
        error.code === 'PGRST116' || // PostgreSQL relation does not exist
        // Connection errors that might resolve
        error.message?.includes('connection') ||
        error.message?.includes('timeout');
      
      if (shouldRetry) {
        console.log(`Error type (${error.code}) is retriable, waiting ${delay * (attempt + 1)}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
        continue;
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  // If we've exhausted all retries
  console.error('All retry attempts failed. Last error:', lastError);
  throw lastError;
};

// Standardized error handler for Supabase errors
export const handleSupabaseError = (error, context = '') => {
  // Format the error for consistent handling
  const errorInfo = {
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
    details: error.details || null,
    context: context,
    timestamp: new Date().toISOString()
  };
  
  // Log the error
  console.error(`Supabase error in ${context}:`, errorInfo);
  
  // For network errors, provide a more user-friendly message
  if (error.message === 'Failed to fetch' || error.code === 'NETWORK_ERROR') {
    errorInfo.message = 'Network connection error. Please check your internet connection.';
  }
  
  return errorInfo;
};

export default supabase;