import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import supabase, { executeWithRetry, handleSupabaseError } from '../utils/supabase';
import { optimizedRequest } from '../utils/requestManager';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, Button, TextField, Typography, Box, Paper, CircularProgress, Alert } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useUser } from '../context/UserContext';

// Validate resource ID format (UUID)
const isValidResourceId = (id) => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Comment cache to reduce database load
const commentCache = {
  data: {},
  timestamp: {},
  ttl: 60000, // 1 minute cache TTL
  
  // Get comments from cache if available and not expired
  get(resourceId) {
    const now = Date.now();
    if (this.data[resourceId] && now - this.timestamp[resourceId] < this.ttl) {
      return this.data[resourceId];
    }
    return null;
  },
  
  // Store comments in cache
  set(resourceId, comments) {
    this.data[resourceId] = comments;
    this.timestamp[resourceId] = Date.now();
  },
  
  // Clear all cache
  clear() {
    this.data = {};
    this.timestamp = {};
  }
};

export default function CommentSection({ resourceId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showAllComments, setShowAllComments] = useState(false);
  const maxCommentsToShow = 5;
  
  const { user } = useUser();
  const resourceIdRef = useRef(resourceId);
  const commentsEndRef = useRef(null);
  const commentsFetched = useRef(false);
  
  // Setup real-time subscription to comments
  const setupSubscription = useCallback(() => {
    // Skip if resource ID is invalid
    if (!isValidResourceId(resourceId)) return null;
    
    console.log(`Setting up subscription for resource ${resourceId}`);
    
    const subscription = supabase
      .channel(`comments:${resourceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `resource_id=eq.${resourceId}`
      }, (payload) => {
        console.log('Comment change detected:', payload);
        
        // Refresh comments when a change is detected
        fetchComments();
      })
      .subscribe((status) => {
        console.log(`Comment subscription status: ${status}`);
      });
    
    return subscription;
  }, [resourceId]);
  
  // Fetch comments for the resource
  const fetchComments = useCallback(async () => {
    // Skip if resource ID is invalid
    if (!isValidResourceId(resourceId)) {
      setLoading(false);
      setError('Invalid resource ID');
      return;
    }
    
    // If we've already fetched comments for this resource, return
    if (commentsFetched.current && resourceIdRef.current === resourceId) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching comments for resource ${resourceId}`);
      
      // Check cache first
      const cachedComments = commentCache.get(resourceId);
      if (cachedComments) {
        console.log(`Found ${cachedComments.length} cached comments for resource ${resourceId}`);
        setComments(cachedComments);
        setLoading(false);
        commentsFetched.current = true;
        resourceIdRef.current = resourceId;
        return;
      }
      
      // Fetch comments with a simpler query that doesn't rely on joins
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('resource_id', resourceId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Process comments and fetch user data separately
      const enhancedComments = await Promise.all(
        (data || []).map(async (comment) => {
          let userData = null;
          
          // Try to get user info if user_id exists
          if (comment.user_id) {
            try {
              // Try users table first
              const { data: userInfo, error: userError } = await supabase
                .from('users')
                .select('username, avatar_url')
                .eq('id', comment.user_id)
                .single();
              
              if (!userError && userInfo) {
                userData = userInfo;
              } else {
                // Fallback to profiles table
                try {
                  const { data: profileInfo, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', comment.user_id)
                    .single();
                  
                  if (!profileError && profileInfo) {
                    userData = profileInfo;
                  }
                } catch (profileError) {
                  console.warn('Failed to fetch profile data for comment:', profileError);
                }
              }
            } catch (userError) {
              console.warn('Failed to fetch user data for comment:', userError);
            }
          }
          
          // Return comment with user data or fallback
          return {
            ...comment,
            user: userData || {
              username: comment.user_id ? `User ${comment.user_id.substring(0, 5)}` : 'Anonymous',
              avatar_url: null
            }
          };
        })
      );
      
      console.log(`Fetched ${enhancedComments.length} comments for resource ${resourceId}`);
      
      // Update state and cache
      setComments(enhancedComments);
      commentCache.set(resourceId, enhancedComments);
      commentsFetched.current = true;
      resourceIdRef.current = resourceId;
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError('Failed to load comments');
      
      // Try again after a delay if we haven't tried too many times
      if (retryCount < 3) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchComments();
        }, 2000 * (retryCount + 1));
      }
    } finally {
      setLoading(false);
    }
  }, [resourceId, retryCount]);
  
  // Initialize comment section
  useEffect(() => {
    // Reset state when resource ID changes
    if (resourceIdRef.current !== resourceId) {
      resourceIdRef.current = resourceId;
      commentsFetched.current = false;
      setComments([]);
      setLoading(true);
      setError(null);
      setRetryCount(0);
    }
    
    // Setup subscription and fetch comments
    const subscription = setupSubscription();
    fetchComments();
    
    // Cleanup subscription when component unmounts or resource ID changes
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [resourceId, fetchComments, setupSubscription]);
  
  // Handle comment submission with optimistic updates
  const handleSubmitComment = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;
    if (submitting) return;
    
    // Skip if resource ID is invalid
    if (!isValidResourceId(resourceId)) {
      setError('Cannot add comment: Invalid resource ID');
      return;
    }
    
    setSubmitting(true);
    
    // Create optimistic comment
    const optimisticId = uuidv4();
    const timestamp = new Date().toISOString();
    const optimisticComment = {
      id: optimisticId,
      content: newComment,
      created_at: timestamp,
      updated_at: timestamp,
      resource_id: resourceId,
      user_id: user?.id || 'anonymous',
      user: {
        id: user?.id || 'anonymous',
        username: user?.username || 'Anonymous',
        avatar_url: user?.avatar_url || null
      },
      isOptimistic: true
    };
    
    // Add optimistic comment to UI immediately
    setComments(prevComments => [optimisticComment, ...prevComments]);
    setNewComment('');
    
    try {
      // Insert comment into database
      const { data, error } = await executeWithRetry(async () => {
        return supabase
          .from('comments')
          .insert({
            content: optimisticComment.content,
            resource_id: resourceId,
            user_id: user?.id
          })
          .select('*, user:profiles(id, username, avatar_url)')
          .single();
      });
      
      if (error) throw error;
      
      // Replace optimistic comment with real one
      setComments(prevComments => 
        prevComments.map(comment => 
          comment.id === optimisticId ? data : comment
        )
      );
      
    } catch (err) {
      console.error('Error submitting comment:', err);
      
      // Handle the error by showing an error message and removing the optimistic comment
      setError('Failed to submit comment: ' + err.message);
      
      // Remove the optimistic comment
      setComments(prevComments => 
        prevComments.filter(comment => comment.id !== optimisticId)
      );
      
      // Keep the comment text so the user doesn't lose their input
      setNewComment(optimisticComment.content);
    } finally {
      setSubmitting(false);
    }
  };
  
  // Delete a comment
  const handleDeleteComment = async (commentId) => {
    if (!user) return;
    
    // Skip if resource ID is invalid
    if (!isValidResourceId(resourceId)) {
      setError('Cannot delete comment: Invalid resource ID');
      return;
    }
    
    // Add optimistic deletion
    setComments(prevComments => 
      prevComments.map(comment => 
        comment.id === commentId ? { ...comment, deleting: true } : comment
      )
    );
    
    try {
      // Delete from database
      const { error } = await executeWithRetry(async () => {
        return supabase
          .from('comments')
          .delete()
          .eq('id', commentId)
          .eq('user_id', user.id);
      });
      
      if (error) throw error;
      
      // Remove from UI
      setComments(prevComments => 
        prevComments.filter(comment => comment.id !== commentId)
      );
      
    } catch (err) {
      console.error('Error deleting comment:', err);
      
      // Remove the deleting state
      setComments(prevComments => 
        prevComments.map(comment => 
          comment.id === commentId ? { ...comment, deleting: false } : comment
        )
      );
      
      setError('Failed to delete comment: ' + err.message);
    }
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (err) {
      return 'Unknown date';
    }
  };
  
  // Scroll to bottom of comments when new comment is added
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);
  
  // Get comments to display based on showAllComments state
  const displayComments = showAllComments ? comments : comments.slice(0, maxCommentsToShow);
  const hasMoreComments = comments.length > maxCommentsToShow;
  
  return (
    <Paper sx={{ p: 3, backgroundColor: 'background.paper', borderRadius: 2, mb: 3 }}>
      <Typography variant="h6" component="h3" sx={{ mb: 2, fontWeight: 'medium' }}>
        Comments {comments.length > 0 && `(${comments.length})`}
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {user ? (
        <Box component="form" onSubmit={handleSubmitComment} sx={{ mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={submitting}
            sx={{ mb: 1 }}
          />
          <Button
            type="submit"
            variant="contained"
            endIcon={<SendIcon />}
            disabled={!newComment.trim() || submitting}
            sx={{
              ml: 'auto',
              display: 'flex',
              bgcolor: 'primary.main',
              '&:hover': { bgcolor: 'primary.dark' }
            }}
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </Button>
        </Box>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          Please sign in to post comments.
        </Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={40} />
        </Box>
      ) : comments.length === 0 ? (
        <Typography variant="body2" sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
          No comments yet. Be the first to comment!
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {displayComments.map((comment) => (
            <Paper 
              key={comment.id} 
              sx={{ 
                p: 2, 
                bgcolor: comment.isOptimistic ? 'action.selected' : 'background.paper',
                opacity: comment.deleting ? 0.5 : 1,
                transition: 'opacity 0.3s',
                position: 'relative',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                <Avatar 
                  src={comment.user?.avatar_url} 
                  alt={comment.user?.username || 'Anonymous'}
                  sx={{ width: 36, height: 36, mr: 1.5 }}
                />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                    {comment.user?.username || 'Anonymous'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {formatDate(comment.created_at)}
                    {comment.isOptimistic && ' (Posting...)'}
                  </Typography>
                </Box>
                
                {user && user.id === comment.user_id && !comment.isOptimistic && (
                  <Button 
                    size="small" 
                    color="error" 
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={comment.deleting}
                    sx={{ minWidth: 'auto', ml: 1 }}
                  >
                    Delete
                  </Button>
                )}
              </Box>
              
              <Typography variant="body2" sx={{ pl: 6.5, whiteSpace: 'pre-wrap' }}>
                {comment.content}
              </Typography>
            </Paper>
          ))}
          
          {hasMoreComments && (
            <Button 
              onClick={() => setShowAllComments(!showAllComments)}
              sx={{ alignSelf: 'center', mt: 1 }}
            >
              {showAllComments ? 'Show Less' : `Show All (${comments.length})`}
            </Button>
          )}
          
          <div ref={commentsEndRef} />
        </Box>
      )}
    </Paper>
  );
} 