import supabase, { checkSupabaseConnection } from './supabase';

// Create an RPC function for getting tables if it doesn't exist
// This is a helper function that will be called when the app starts
const createGetTablesFunction = async () => {
  try {
    // First test if the function already exists by calling it
    const { data, error } = await supabase.rpc('get_tables');
    
    // If it works, we're done
    if (!error) {
      return true;
    }
    
    console.log('Creating get_tables function...');
    
    // We'll try to create the function if it doesn't exist
    // This requires postgres privileges which the app may not have
    const { error: createError } = await supabase.rpc('create_get_tables_function');
    
    if (createError) {
      console.warn('Could not create get_tables function:', createError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn('Error checking/creating get_tables function:', error);
    return false;
  }
};

// Function to set up the database tables and seed data
export const setupDatabase = async () => {
  try {
    console.log('Setting up database...');
    
    // First, check if we have a working connection to the Supabase server
    const isConnected = await checkSupabaseConnection(true); // Force a fresh check
    
    if (!isConnected) {
      console.error('Cannot connect to Supabase');
      return false;
    }
    
    console.log('Connection to Supabase successful!');
    
    // Try to create our diagnostic utilities
    await createGetTablesFunction();
    
    // Insert translations
    try {
      const { error: enError } = await supabase
        .from('translations')
        .upsert(
          [
            { language: 'en', key: 'home.hero.title', value: 'Discover' },
            { language: 'en', key: 'home.hero.titleHighlight', value: 'Creative Resources' },
            { language: 'en', key: 'home.hero.titleEnd', value: 'for Your Projects' },
            { language: 'en', key: 'home.hero.subtitle', value: 'Find the best tools, assets, and inspiration for designers, developers, and creators.' },
            { language: 'en', key: 'home.search.placeholder', value: 'Search for resources, tools, or inspiration...' },
            { language: 'en', key: 'home.search.submit', value: 'Submit search' },
            { language: 'en', key: 'categories.assets', value: 'Assets' },
            { language: 'en', key: 'categories.tools', value: 'Tools' },
            { language: 'en', key: 'categories.community', value: 'Community' },
            { language: 'en', key: 'categories.reference', value: 'Reference' },
            { language: 'en', key: 'categories.inspiration', value: 'Inspiration' },
            { language: 'en', key: 'categories.learn', value: 'Learn' },
            { language: 'en', key: 'categories.software', value: 'Software' }
          ],
          { 
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );
        
      if (enError) {
        if (enError.code === '42P01') {
          console.warn('Translation table does not exist, but that may be okay');
        } else {
          console.error('Error inserting English translations:', enError);
        }
      } else {
        console.log('English translations inserted successfully');
      }
    } catch (translationError) {
      console.error('Error with translations:', translationError);
    }
    
    // Try creating Spanish translations as well
    try {
      const { error: esError } = await supabase
        .from('translations')
        .upsert(
          [
            { language: 'es', key: 'home.hero.title', value: 'Descubre' },
            { language: 'es', key: 'home.hero.titleHighlight', value: 'Recursos Creativos' },
            { language: 'es', key: 'home.hero.titleEnd', value: 'para Tus Proyectos' },
            { language: 'es', key: 'home.hero.subtitle', value: 'Encuentra las mejores herramientas, recursos e inspiración para diseñadores, desarrolladores y creadores.' },
            { language: 'es', key: 'home.search.placeholder', value: 'Buscar recursos, herramientas o inspiración...' },
            { language: 'es', key: 'home.search.submit', value: 'Buscar' },
            { language: 'es', key: 'categories.assets', value: 'Recursos' },
            { language: 'es', key: 'categories.tools', value: 'Herramientas' },
            { language: 'es', key: 'categories.community', value: 'Comunidad' },
            { language: 'es', key: 'categories.reference', value: 'Referencia' },
            { language: 'es', key: 'categories.inspiration', value: 'Inspiración' },
            { language: 'es', key: 'categories.learn', value: 'Aprender' },
            { language: 'es', key: 'categories.software', value: 'Software' }
          ],
          { 
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );
        
      if (esError && esError.code !== '42P01') {
        console.error('Error inserting Spanish translations:', esError);
      } else if (!esError) {
        console.log('Spanish translations inserted successfully');
      }
    } catch (esError) {
      console.error('Error with Spanish translations:', esError);
    }
    
    console.log('Database setup phase completed');
    return true;
  } catch (error) {
    console.error('Unexpected error in setupDatabase:', error);
    return false;
  }
};

// Check if database is properly set up
export const checkDatabaseSetup = async () => {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('Not in browser environment, skipping database setup check');
      return false;
    }
    
    console.log('Checking database setup...');
    
    // Try to list tables using get_tables RPC function
    try {
      // This uses pg_catalog to check table existence - should work with public access
      const { data: tables, error: tablesError } = await supabase
        .rpc('get_tables', {})
        .single();
        
      if (!tablesError && tables) {
        console.log('Available tables in schema:', tables);
      } else {
        console.log('Could not get table list using RPC:', tablesError);
        // Instead of failing, we'll try direct table checks below
      }
    } catch (error) {
      console.log('Table listing not supported with current permissions or RPC function missing. Will check tables directly.');
      // Continue to direct table check
    }
    
    // Try multiple tables in sequence - we consider the DB set up if ANY of them exist
    // This makes our app more resilient to different database configurations
    const tablesToCheck = ['resources', 'translations', 'favorites', 'comments', 'profiles'];
    let anyTableExists = false;
    
    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('count', { count: 'exact', head: true })
          .limit(1);
          
        // If we get a "relation does not exist" error, table doesn't exist
        if (error && error.code === '42P01') {
          console.log(`Table check: ${table} does not exist`);
          continue;
        }
        
        // Other errors - log but don't fail
        if (error) {
          console.error(`Error checking ${table} table:`, error);
          continue;
        }
        
        // If we got this far, table exists
        console.log(`Table check: ${table} exists`);
        anyTableExists = true;
        break;
      } catch (tableError) {
        console.error(`Exception checking ${table} table:`, tableError);
        continue;
      }
    }
    
    // Return true if any table exists
    return anyTableExists;
  } catch (error) {
    console.error('Error checking database setup:', error);
    return false;
  }
}; 