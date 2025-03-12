import supabase, { checkSupabaseConnection } from './utils/supabase';

// Simple test to verify Supabase connection
const testSupabaseConnection = async () => {
  console.log('Testing Supabase connection...');
  console.log(`URL: ${import.meta.env.VITE_SUPABASE_URL}`);
  console.log(`API Key available: ${!!import.meta.env.VITE_SUPABASE_ANON_KEY}`);
  
  try {
    // Check connection
    const isConnected = await checkSupabaseConnection(true); // Force fresh check
    
    if (isConnected) {
      console.log('✅ Successfully connected to Supabase!');
    } else {
      console.error('❌ Failed to connect to Supabase');
    }
    
    // Try to fetch data from a table
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .limit(5);
      
    if (error) {
      console.error('Error fetching resources:', error);
    } else {
      console.log(`Successfully fetched ${data.length} resources:`);
      data.forEach((resource, index) => {
        console.log(`${index + 1}. ${resource.title || 'Untitled'}`);
      });
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
};

// Run the test
testSupabaseConnection();

// Export for use in other files if needed
export { testSupabaseConnection }; 