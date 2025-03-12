import supabase from './supabase';

/**
 * This script sets up the admin profile by adding the is_admin column to the profiles table
 * and setting the first user as admin.
 */
export async function setupAdminProfile() {
  try {
    console.log('Setting up admin profile...');
    
    // SQL statements to set up admin profile
    const statements = [
      // Add is_admin column to profiles table if it doesn't exist
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'profiles' 
          AND column_name = 'is_admin'
        ) THEN
          ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
          RAISE NOTICE 'Added is_admin column to profiles table';
        ELSE
          RAISE NOTICE 'is_admin column already exists in profiles table';
        END IF;
      END $$`,
      
      // Create function to set the first user as admin
      `CREATE OR REPLACE FUNCTION set_first_user_as_admin()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Check if this is the first user
        IF (SELECT COUNT(*) FROM profiles) = 1 THEN
          UPDATE profiles SET is_admin = true WHERE id = NEW.id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`,
      
      // Create trigger to set first user as admin
      `DROP TRIGGER IF EXISTS set_first_user_as_admin_trigger ON profiles;
      CREATE TRIGGER set_first_user_as_admin_trigger
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION set_first_user_as_admin()`
    ];
    
    console.log(`Prepared ${statements.length} SQL statements to execute`);
    
    // Check if we have the exec_sql function
    const { error: checkError } = await supabase.rpc('exec_sql', { 
      sql: 'SELECT 1' 
    });
    
    // If exec_sql doesn't exist, we can't run the statements
    if (checkError && checkError.message.includes('function exec_sql') && checkError.message.includes('does not exist')) {
      console.log('The exec_sql function does not exist. You need to run the SQL manually in the Supabase SQL editor.');
      console.log('Please copy the SQL statements from src/db/add_admin_column.sql and run them in the Supabase SQL editor.');
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
    
    // Try to set current user as admin if they're the only user
    try {
      const { data: user } = await supabase.auth.getUser();
      
      if (user && user.user) {
        const { data: profileCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });
          
        if (profileCount === 1) {
          const { error } = await supabase
            .from('profiles')
            .update({ is_admin: true })
            .eq('id', user.user.id);
            
          if (!error) {
            console.log('Current user set as admin');
          }
        }
      }
    } catch (error) {
      console.error('Error setting current user as admin:', error);
    }
    
    console.log(`Admin profile setup completed. Success: ${successCount}, Errors: ${errorCount}`);
    
    if (errorCount > 0) {
      console.log('There were errors. You may need to run the SQL manually in the Supabase SQL editor.');
      return {
        success: successCount > 0,
        message: `Setup completed with ${errorCount} errors. Some statements may have succeeded.`
      };
    }
    
    return {
      success: true,
      message: 'Admin profile setup completed successfully.'
    };
  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      success: false,
      message: `Unexpected error: ${error.message}`
    };
  }
}

export default setupAdminProfile;