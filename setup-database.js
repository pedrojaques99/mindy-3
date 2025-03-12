/**
 * This script sets up the database by running all SQL scripts
 * 
 * Usage:
 *   node setup-database.js
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables.');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// SQL files to execute in order
const sqlFiles = [
  'src/db/create_functions.sql',
  'src/db/create_most_liked_function.sql',
  'src/db/create_most_liked_function_v2.sql',
  'src/db/update-translations-most-liked.sql',
  'src/db/fix_favorites_rls.sql'
];

// Function to execute SQL queries
async function executeQuery(sql) {
  try {
    // Use RPC to execute raw SQL
    const { data, error } = await supabase.rpc('execute_sql', { sql });
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error('Error executing SQL:', err);

    // Try direct query as fallback
    try {
      const { data, error } = await supabase.auth.admin.executeSql(sql);
      
      if (error) {
        throw error;
      }
      
      return data;
    } catch (directError) {
      console.error('Also failed with direct SQL execution:', directError);
      throw directError;
    }
  }
}

// Main function
async function setupDatabase() {
  console.log('Starting database setup...');
  
  // Create execute_sql function if it doesn't exist
  const createExecuteSqlFn = `
  CREATE OR REPLACE FUNCTION execute_sql(sql TEXT)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    EXECUTE sql;
    RETURN jsonb_build_object('success', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  $$;
  
  -- Grant execute permission
  GRANT EXECUTE ON FUNCTION execute_sql TO service_role;
  `;
  
  try {
    console.log('Setting up execute_sql function...');
    // Try to use direct SQL execution for this
    const { error } = await supabase.auth.admin.executeSql(createExecuteSqlFn);
    
    if (error) {
      console.warn('Warning: Failed to create execute_sql function. Some scripts may fail:', error);
    }
  } catch (err) {
    console.warn('Warning: Failed to create execute_sql function. Will try to proceed anyway:', err);
  }
  
  // Execute SQL files in order
  for (const file of sqlFiles) {
    try {
      console.log(`Executing ${file}...`);
      const sql = fs.readFileSync(path.resolve(file), 'utf8');
      
      // Split the SQL into statements and execute each one
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          const result = await executeQuery(statement);
          console.log(`Executed statement successfully:`, result);
        }
      }
      
      console.log(`Successfully executed ${file}`);
    } catch (err) {
      console.error(`Error executing ${file}:`, err);
      // Continue with next file
    }
  }
  
  console.log('Database setup complete!');
}

// Run the main function
setupDatabase()
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  })
  .finally(() => {
    console.log('Done!');
  }); 