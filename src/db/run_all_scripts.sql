-- This script runs all required database setup scripts in order
-- Use this to initialize or update your database schema

-- First create the get_tables function
\i 'src/db/create_functions.sql'

-- Create the most liked resources function
\i 'src/db/create_most_liked_function.sql'

-- Create enhanced version of most liked resources function
\i 'src/db/create_most_liked_function_v2.sql'

-- Update translations
\i 'src/db/update-translations-most-liked.sql'

-- Fix favorites RLS
\i 'src/db/fix_favorites_rls.sql'

-- Done!
SELECT 'All database scripts executed successfully!' as result; 