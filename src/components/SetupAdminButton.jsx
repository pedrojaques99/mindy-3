import React, { useState } from 'react';
import { setupAdminProfile } from '../utils/setupAdminProfile';
import toast from 'react-hot-toast';

export default function SetupAdminButton() {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [result, setResult] = useState(null);
  
  const runSetup = async () => {
    setIsSettingUp(true);
    setResult(null);
    
    try {
      const setupResult = await setupAdminProfile();
      setResult(setupResult);
      
      if (setupResult.success) {
        toast.success('Admin profile set up successfully!');
      } else {
        toast.error(setupResult.message || 'Failed to set up admin profile');
      }
    } catch (error) {
      console.error('Error running admin setup:', error);
      setResult({
        success: false,
        message: `Error: ${error.message}`
      });
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsSettingUp(false);
    }
  };
  
  return (
    <div className="p-4 bg-dark-300 rounded-lg border border-glass-300 mt-4">
      <h3 className="text-lg font-medium mb-2">Set Up Admin Profile</h3>
      <p className="text-sm text-gray-300 mb-4">
        This will add the admin column to the profiles table and set the first user as admin.
        Run this if you need to set up admin access.
      </p>
      
      <button
        onClick={runSetup}
        disabled={isSettingUp}
        className="px-4 py-2 bg-lime-accent/20 text-lime-accent rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSettingUp ? 'Setting up...' : 'Run Setup'}
      </button>
      
      {result && (
        <div className={`mt-4 p-3 rounded-lg ${result.success ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
          <p className="text-sm">{result.message}</p>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-400">
        <p>If the automatic setup doesn't work, you may need to run the SQL manually in the Supabase SQL editor.</p>
        <p className="mt-1">Check the browser console for more details.</p>
      </div>
    </div>
  );
} 