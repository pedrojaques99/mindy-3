import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useUser } from '../context/UserContext';
import toast from 'react-hot-toast';
import FixCommentsButton from '../components/FixCommentsButton';
import SetupAdminButton from '../components/SetupAdminButton';
import { CheckIcon, XIcon, ExternalLinkIcon } from '@heroicons/react/solid';

export default function AdminPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [pendingResources, setPendingResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Check if user is admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  
  useEffect(() => {
    // Check if user is logged in
    if (!user) {
      toast.error('You must be signed in to access the admin page');
      navigate('/');
      return;
    }
    
    // Check if user is admin
    const checkAdmin = async () => {
      try {
        setIsCheckingAdmin(true);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();
          
        if (error) {
          // If the error is that the profile doesn't exist, create it
          if (error.code === 'PGRST116') {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert([
                { 
                  id: user.id,
                  email: user.email,
                  username: user.email?.split('@')[0] || 'user',
                  is_admin: false
                }
              ]);
              
            if (insertError) throw insertError;
            
            // Check again after creating the profile
            const { data: newData, error: newError } = await supabase
              .from('profiles')
              .select('is_admin')
              .eq('id', user.id)
              .single();
              
            if (newError) throw newError;
            
            if (newData && newData.is_admin) {
              setIsAdmin(true);
              fetchPendingResources();
            } else {
              toast.error('You do not have permission to access this page');
              navigate('/');
            }
          } else {
            throw error;
          }
        } else {
          if (data && data.is_admin) {
            setIsAdmin(true);
            fetchPendingResources();
          } else {
            toast.error('You do not have permission to access this page');
            navigate('/');
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        toast.error('Failed to verify admin permissions');
      } finally {
        setIsCheckingAdmin(false);
      }
    };
    
    checkAdmin();
  }, [user, navigate]);
  
  // Fetch pending resources
  const fetchPendingResources = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('resources')
        .select(`
          *,
          profiles:user_id (email, username)
        `)
        .eq('approved', false)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      setPendingResources(data || []);
    } catch (error) {
      console.error('Error fetching pending resources:', error);
      toast.error('Failed to load pending resources');
    } finally {
      setLoading(false);
    }
  };
  
  // Approve a resource
  const approveResource = async (id) => {
    if (processingId) return; // Prevent multiple simultaneous operations
    
    try {
      setProcessingId(id);
      
      const { error } = await supabase
        .from('resources')
        .update({ approved: true })
        .eq('id', id);
        
      if (error) throw error;
      
      toast.success('Resource approved successfully');
      setPendingResources(pendingResources.filter(resource => resource.id !== id));
    } catch (error) {
      console.error('Error approving resource:', error);
      toast.error('Failed to approve resource');
    } finally {
      setProcessingId(null);
    }
  };
  
  // Reject a resource
  const rejectResource = async (id) => {
    if (processingId) return; // Prevent multiple simultaneous operations
    
    if (!window.confirm('Are you sure you want to delete this resource? This action cannot be undone.')) {
      return;
    }
    
    try {
      setProcessingId(id);
      
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      toast.success('Resource rejected and deleted');
      setPendingResources(pendingResources.filter(resource => resource.id !== id));
    } catch (error) {
      console.error('Error rejecting resource:', error);
      toast.error('Failed to reject resource');
    } finally {
      setProcessingId(null);
    }
  };
  
  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Make a user admin
  const makeUserAdmin = async () => {
    const email = prompt('Enter the email of the user you want to make admin:');
    
    if (!email) return;
    
    try {
      // First, find the user by email
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .single();
        
      if (userError) {
        if (userError.code === 'PGRST116') {
          toast.error(`No user found with email: ${email}`);
        } else {
          throw userError;
        }
        return;
      }
      
      // Update the user's admin status
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', userData.id);
        
      if (error) throw error;
      
      toast.success(`User ${email} is now an admin`);
    } catch (error) {
      console.error('Error making user admin:', error);
      toast.error('Failed to update admin status');
    }
  };
  
  if (isCheckingAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-accent"></div>
        </div>
      </div>
    );
  }
  
  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto glass-card p-6">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-gray-300 mb-6">
            You need admin privileges to access this page. If you're the first user of the system,
            you can set yourself as an admin using the button below.
          </p>
          <SetupAdminButton />
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Database Tools */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Database Tools</h2>
            <FixCommentsButton />
            <SetupAdminButton />
            
            <div className="mt-4 p-4 bg-dark-300 rounded-lg border border-glass-300">
              <h3 className="text-lg font-medium mb-2">Admin Management</h3>
              <p className="text-sm text-gray-300 mb-4">
                Make another user an admin by their email address.
              </p>
              
              <button
                onClick={makeUserAdmin}
                className="px-4 py-2 bg-lime-accent/20 text-lime-accent rounded-lg"
              >
                Add Admin User
              </button>
            </div>
          </div>
          
          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold mb-4">Admin Stats</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Pending Resources:</span>
                <span className="font-medium">{pendingResources.length}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Resource Management */}
        <div className="lg:col-span-2">
          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold mb-4">Pending Resources</h2>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-accent"></div>
              </div>
            ) : pendingResources.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No pending resources to approve.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingResources.map(resource => (
                  <div key={resource.id} className="p-4 bg-dark-300 rounded-lg border border-glass-300">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium">{resource.title}</h3>
                        <p className="text-sm text-gray-400">
                          Submitted by {resource.profiles?.username || resource.profiles?.email || 'Unknown'} on {formatDate(resource.created_at)}
                        </p>
                      </div>
                      
                      <div className="flex space-x-2">
                        <a 
                          href={resource.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-white"
                          title="Visit URL"
                        >
                          <ExternalLinkIcon className="w-5 h-5" />
                        </a>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <p className="text-sm text-gray-300">{resource.description}</p>
                    </div>
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-2 py-1 text-xs bg-dark-400 rounded-md">
                        {resource.category}
                      </span>
                      
                      {resource.tags && resource.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 text-xs bg-dark-400 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="mt-4 flex justify-end space-x-3">
                      <button
                        onClick={() => rejectResource(resource.id)}
                        disabled={processingId === resource.id}
                        className="px-3 py-1 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        <XIcon className="w-4 h-4 mr-1" />
                        Reject
                      </button>
                      
                      <button
                        onClick={() => approveResource(resource.id)}
                        disabled={processingId === resource.id}
                        className="px-3 py-1 bg-green-900/30 text-green-400 rounded-lg hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 