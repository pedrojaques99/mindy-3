import supabase from './supabase';
import fs from 'fs';
import path from 'path';

/**
 * This script fixes the comments table and RLS policies in your Supabase project.
 * It reads the SQL file and executes it using the Supabase client.
 * 
 * To run this script:
 * 1. Make sure you have the correct Supabase credentials in your .env file
 * 2. Run: node src/utils/fixCommentsTable.js
 */
async function fixCommentsTable() {
  try {
    console.log('Starting comments table fix...');
    
    // Read the SQL file
    const sqlFilePath = path.resolve(__dirname, '../db/fix_comments_table.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = sql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error(`Error executing statement ${i + 1}:`, error);
          
          // If the error is about the exec_sql function not existing, we need to create it
          if (error.message.includes('function exec_sql') && error.message.includes('does not exist')) {
            console.log('The exec_sql function does not exist. Creating it...');
            
            // Create the exec_sql function
            const createFunctionSql = `
              CREATE OR REPLACE FUNCTION exec_sql(sql text)
              RETURNS void AS $$
              BEGIN
                EXECUTE sql;
              END;
              $$ LANGUAGE plpgsql SECURITY DEFINER;
            `;
            
            const { error: createError } = await supabase.rpc('exec_sql', { sql: createFunctionSql });
            
            if (createError) {
              console.error('Could not create exec_sql function:', createError);
              console.log('You may need to run the SQL manually in the Supabase SQL editor.');
              break;
            }
            
            // Try executing the statement again
            const { error: retryError } = await supabase.rpc('exec_sql', { sql: statement });
            
            if (retryError) {
              console.error(`Error executing statement ${i + 1} (retry):`, retryError);
            } else {
              console.log(`Statement ${i + 1} executed successfully (retry)`);
            }
          } else {
            console.log('You may need to run the SQL manually in the Supabase SQL editor.');
          }
        } else {
          console.log(`Statement ${i + 1} executed successfully`);
        }
      } catch (error) {
        console.error(`Exception executing statement ${i + 1}:`, error);
      }
    }
    
    console.log('Comments table fix completed.');
    console.log('If there were errors, you may need to run the SQL manually in the Supabase SQL editor.');
    console.log('SQL file location:', sqlFilePath);
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the function
fixCommentsTable();

// Export the function for use in other files
export default fixCommentsTable; 