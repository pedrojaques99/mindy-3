import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import supabase, { checkSupabaseConnection } from './utils/supabase';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';

// Check if Supabase mode is forced by user preference
const isSupabaseForced = localStorage.getItem('forceSupabaseConnection') === 'true';

// Log Supabase mode status
console.log(`Application starting in ${isSupabaseForced ? 'Supabase' : 'Local Data'} mode`);
if (!isSupabaseForced) {
  console.log('Supabase connection checks disabled for performance. Use the toggle in the UI to enable if needed.');
}

// Validate that we have a proper API key
const isValidKey = (key) => {
  return typeof key === 'string' && key.length > 20 && key.includes('.');
};

// Log API key status for debugging
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!isValidKey(supabaseKey)) {
  console.warn('Warning: Supabase API key appears to be invalid or malformed');
  console.log('API Key length:', supabaseKey ? supabaseKey.length : 0);
  console.log('First characters:', supabaseKey ? supabaseKey.substring(0, 10) + '...' : 'undefined');
} else {
  console.log('Supabase API key format appears valid');
}

// Listen for auth state changes to handle token refreshes
supabase.auth.onAuthStateChange((event, session) => {
  // Skip logging if not in Supabase mode
  if (!isSupabaseForced && event !== 'SIGNED_IN') {
    return;
  }
  
  // Log auth events for debugging
  console.log(`Supabase auth state changed: ${event}`, {
    userId: session?.user?.id || 'none',
    hasToken: !!session?.access_token,
    expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none'
  });
  
  // Handle specific auth events
  if (event === 'SIGNED_IN') {
    console.log('User signed in - RLS policies now active');
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out - RLS policies will restrict access');
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('Auth token refreshed - continuing with existing session');
  } else if (event === 'USER_UPDATED') {
    console.log('User data updated');
  }
});

// Render the app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Toaster position="top-center" />
    <App />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
); 