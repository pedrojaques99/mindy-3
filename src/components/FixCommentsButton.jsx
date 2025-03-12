import React, { useState } from 'react';
import { fixCommentsFrontend } from '../utils/fixCommentsFrontend';
import toast from 'react-hot-toast';

export default function FixCommentsButton() {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState(null);
  
  const runFix = async () => {
    setIsFixing(true);
    setResult(null);
    
    try {
      const fixResult = await fixCommentsFrontend();
      setResult(fixResult);
      
      if (fixResult.success) {
        toast.success('Comments table fixed successfully!');
      } else {
        toast.error(fixResult.message || 'Failed to fix comments table');
      }
    } catch (error) {
      console.error('Error running fix:', error);
      setResult({
        success: false,
        message: `Error: ${error.message}`
      });
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsFixing(false);
    }
  };
  
  return (
    <div className="p-4 bg-dark-300 rounded-lg border border-glass-300">
      <h3 className="text-lg font-medium mb-2">Fix Comments Table</h3>
      <p className="text-sm text-gray-300 mb-4">
        This will fix the comments table and RLS policies in your Supabase project.
        Run this if you're experiencing issues with comments functionality.
      </p>
      
      <button
        onClick={runFix}
        disabled={isFixing}
        className="px-4 py-2 bg-lime-accent/20 text-lime-accent rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isFixing ? 'Fixing...' : 'Run Fix'}
      </button>
      
      {result && (
        <div className={`mt-4 p-3 rounded-lg ${result.success ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
          <p className="text-sm">{result.message}</p>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-400">
        <p>If the automatic fix doesn't work, you may need to run the SQL manually in the Supabase SQL editor.</p>
        <p className="mt-1">Check the browser console for more details.</p>
      </div>
    </div>
  );
} 