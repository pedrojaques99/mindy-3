-- Create comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_comments_resource_id ON comments(resource_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Create policies for comments
-- Allow anyone to read comments
CREATE POLICY "Comments are viewable by everyone" 
  ON comments FOR SELECT USING (true);

-- Allow authenticated users to insert their own comments
CREATE POLICY "Users can create their own comments" 
  ON comments FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments" 
  ON comments FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Allow users to delete their own comments
CREATE POLICY "Users can delete their own comments" 
  ON comments FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on comment update
CREATE TRIGGER update_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- If resource_comments table exists, migrate data to comments table
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'resource_comments'
  ) THEN
    -- Copy data from resource_comments to comments if not already there
    INSERT INTO comments (id, resource_id, user_id, content, created_at, updated_at)
    SELECT id, resource_id, user_id, content, created_at, updated_at
    FROM resource_comments
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Data migrated from resource_comments to comments table';
  END IF;
END $$; 