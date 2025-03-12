-- Function to get all tables in the database
-- This resolves the "Could not find the function public.get_tables" error
CREATE OR REPLACE FUNCTION get_tables()
RETURNS TABLE (
  name text,
  schema text
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    table_name as name,
    table_schema as schema
  FROM 
    information_schema.tables 
  WHERE 
    table_schema = 'public'
    AND table_type = 'BASE TABLE';
$$;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION get_tables TO authenticated, anon; 