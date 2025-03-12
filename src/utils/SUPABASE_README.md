# Supabase Integration Guide

This document provides information on how to use Supabase in this project.

## Setup

The Supabase client is already configured in `src/utils/supabase.js`. It uses environment variables from the `.env` file:

```
VITE_SUPABASE_URL=https://bweemuqoelppnyeyeysr.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Usage

### Importing the Supabase Client

```javascript
import supabase from '../utils/supabase';
```

### Basic Operations

#### Fetching Data

```javascript
const fetchData = async () => {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Data:', data);
};
```

#### Inserting Data

```javascript
const insertData = async (newRecord) => {
  const { data, error } = await supabase
    .from('table_name')
    .insert([newRecord])
    .select();
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Inserted data:', data);
};
```

#### Updating Data

```javascript
const updateData = async (id, updates) => {
  const { data, error } = await supabase
    .from('table_name')
    .update(updates)
    .eq('id', id)
    .select();
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Updated data:', data);
};
```

#### Deleting Data

```javascript
const deleteData = async (id) => {
  const { error } = await supabase
    .from('table_name')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Record deleted successfully');
};
```

### Authentication

#### Sign Up

```javascript
const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('User signed up:', data);
};
```

#### Sign In

```javascript
const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('User signed in:', data);
};
```

#### Sign Out

```javascript
const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('User signed out');
};
```

#### Get Current User

```javascript
const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Current user:', data.user);
};
```

## Examples

For more examples, see the `src/examples/supabaseExample.js` file.

## Testing

You can test the Supabase connection using the `src/test-supabase.js` script.

## Troubleshooting

If you encounter issues with Supabase:

1. Check that your environment variables are correctly set in the `.env` file
2. Verify that your Supabase project is running and accessible
3. Check the browser console for any error messages
4. Ensure you have the correct permissions for the tables you're trying to access 