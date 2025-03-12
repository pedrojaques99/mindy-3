import supabase from './supabase';

/**
 * This script fixes the comments table and RLS policies in your Supabase project.
 * It can be run directly from the browser.
 */
export async function fixCommentsFrontend() {
  try {
    console.log('Starting comments table fix (frontend version)...');
    
    // SQL statements to fix the comments table
    const statements = [
      // Create comments table if it doesn't exist
      `CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        resource_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Create indexes for faster queries
      `CREATE INDEX IF NOT EXISTS idx_comments_resource_id ON comments(resource_id)`,
      `CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)`,
      
      // Enable RLS (Row Level Security)
      `ALTER TABLE comments ENABLE ROW LEVEL SECURITY`,
      
      // Create policies for comments
      // Allow anyone to read comments
      `CREATE POLICY "Comments are viewable by everyone" 
        ON comments FOR SELECT USING (true)`,
      
      // Allow authenticated users to insert their own comments
      `CREATE POLICY "Users can create their own comments" 
        ON comments FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id)`,
      
      // Allow users to update their own comments
      `CREATE POLICY "Users can update their own comments" 
        ON comments FOR UPDATE 
        TO authenticated 
        USING (auth.uid() = user_id)`,
      
      // Allow users to delete their own comments
      `CREATE POLICY "Users can delete their own comments" 
        ON comments FOR DELETE 
        TO authenticated 
        USING (auth.uid() = user_id)`
    ];
    
    console.log(`Prepared ${statements.length} SQL statements to execute`);
    
    // Check if we have the exec_sql function
    const { error: checkError } = await supabase.rpc('exec_sql', { 
      sql: 'SELECT 1' 
    });
    
    // If exec_sql doesn't exist, we can't run the statements
    if (checkError && checkError.message.includes('function exec_sql') && checkError.message.includes('does not exist')) {
      console.log('The exec_sql function does not exist. You need to run the SQL manually in the Supabase SQL editor.');
      console.log('Please copy the SQL statements from src/db/fix_comments_table.sql and run them in the Supabase SQL editor.');
      return {
        success: false,
        message: 'The exec_sql function does not exist. Please run the SQL manually in the Supabase SQL editor.'
      };
    }
    
    // Execute each statement
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error(`Error executing statement ${i + 1}:`, error);
          errorCount++;
        } else {
          console.log(`Statement ${i + 1} executed successfully`);
          successCount++;
        }
      } catch (error) {
        console.error(`Exception executing statement ${i + 1}:`, error);
        errorCount++;
      }
    }
    
    console.log(`Comments table fix completed. Success: ${successCount}, Errors: ${errorCount}`);
    
    if (errorCount > 0) {
      console.log('There were errors. You may need to run the SQL manually in the Supabase SQL editor.');
      return {
        success: successCount > 0,
        message: `Fix completed with ${errorCount} errors. Some statements may have succeeded.`
      };
    }
    
    return {
      success: true,
      message: 'Comments table fix completed successfully.'
    };
  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      success: false,
      message: `Unexpected error: ${error.message}`
    };
  }
}

export default fixCommentsFrontend; 