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
    
    // Try to access a system table or make a basic query that will work
    // even if the app has no custom tables yet
    const { data, error } = await supabase
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
        console.error(`
