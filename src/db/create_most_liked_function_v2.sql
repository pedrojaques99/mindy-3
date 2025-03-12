-- Enhanced function to get resources ordered by the number of favorites
-- Uses plpgsql to handle errors and checks if tables exist
CREATE OR REPLACE FUNCTION get_most_liked_resources_v2(limit_count INTEGER DEFAULT 6)
RETURNS SETOF resources
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if favorites table exists first
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'favorites'
  ) THEN
    -- If favorites table exists, use it for sorting
    RETURN QUERY
    SELECT r.*
    FROM resources r
    LEFT JOIN (
      SELECT resource_id, COUNT(*) as favorite_count
      FROM favorites
      GROUP BY resource_id
    ) f ON r.id = f.resource_id
    ORDER BY f.favorite_count DESC NULLS LAST, r.created_at DESC
    LIMIT limit_count;
  ELSE
    -- If no favorites table, just sort by created_at
    RETURN QUERY
    SELECT *
    FROM resources
    ORDER BY created_at DESC
    LIMIT limit_count;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback for any errors
    RETURN QUERY
    SELECT *
    FROM resources
    ORDER BY created_at DESC
    LIMIT limit_count;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_most_liked_resources_v2 TO anon, authenticated; 