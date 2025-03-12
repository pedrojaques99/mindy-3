-- Add is_admin column to profiles table if it doesn't exist
DO $$
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
END $$;

-- Create profiles table if it doesn't exist
-- This is a fallback in case the profiles table doesn't exist yet
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT false
);

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
-- Allow users to read all profiles
CREATE POLICY IF NOT EXISTS "Profiles are viewable by everyone" 
  ON profiles FOR SELECT USING (true);

-- Allow users to update their own profile
CREATE POLICY IF NOT EXISTS "Users can update their own profile" 
  ON profiles FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY IF NOT EXISTS "Users can insert their own profile" 
  ON profiles FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = id);

-- Create function to set the first user as admin
-- This is useful for initial setup
CREATE OR REPLACE FUNCTION set_first_user_as_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first user
  IF (SELECT COUNT(*) FROM profiles) = 1 THEN
    UPDATE profiles SET is_admin = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set first user as admin
DROP TRIGGER IF EXISTS set_first_user_as_admin_trigger ON profiles;
CREATE TRIGGER set_first_user_as_admin_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_first_user_as_admin(); 