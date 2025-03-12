import supabase from '../utils/supabase';

/**
 * Example functions demonstrating how to use Supabase client
 */

// Example: Fetch data from a table
export const fetchResources = async () => {
  try {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .limit(10);
      
    if (error) {
      console.error('Error fetching resources:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Insert data into a table
export const createResource = async (resource) => {
  try {
    const { data, error } = await supabase
      .from('resources')
      .insert([resource])
      .select();
      
    if (error) {
      console.error('Error creating resource:', error);
      return { success: false, error };
    }
    
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Update data in a table
export const updateResource = async (id, updates) => {
  try {
    const { data, error } = await supabase
      .from('resources')
      .update(updates)
      .eq('id', id)
      .select();
      
    if (error) {
      console.error('Error updating resource:', error);
      return { success: false, error };
    }
    
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Delete data from a table
export const deleteResource = async (id) => {
  try {
    const { error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Error deleting resource:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Authentication - Sign up a new user
export const signUp = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error('Error signing up:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Authentication - Sign in a user
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Error signing in:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Authentication - Sign out
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
};

// Example: Get current user
export const getCurrentUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Error getting current user:', error);
      return { success: false, error };
    }
    
    return { success: true, user: data.user };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error };
  }
}; 