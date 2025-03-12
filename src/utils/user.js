import supabase from './supabase';

export const updateUserProfile = async (updates) => {
  try {
    // Skip Supabase request if in local mode
    const forceSupabase = localStorage.getItem('forceSupabaseConnection') === 'true';
    if (!forceSupabase) {
      console.log('Skipping profile update in local mode');
      return true;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No user logged in');
    
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
      
    if (error) {
      // If the table doesn't exist, just return success
      if (error.code === '42P01') {
        console.log("Profiles table doesn't exist, skipping update");
        return true;
      }
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
}; 