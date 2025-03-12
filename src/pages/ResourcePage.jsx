import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { 
  ArrowLeftIcon, 
  ExternalLinkIcon, 
  HeartIcon, 
  ShareIcon,
  TagIcon,
  RefreshIcon
} from '@heroicons/react/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/solid';
import supabase, { executeWithRetry, handleSupabaseError } from '../utils/supabase';
import { optimizedRequest } from '../utils/requestManager';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import SoftwareIcon from '../components/ui/SoftwareIcon';
import AutoThumbnail from '../components/ui/AutoThumbnail';
import CommentSection from '../components/CommentSection';
import RelatedResources from '../components/RelatedResources';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import { getResourceThumbnails } from '../utils/thumbnailUtils';
import { getResourceById, trackResourceView, toggleFavorite as toggleFavoriteUtil, checkAuthStatus } from '../utils/resourceUtils';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';

// Validate resource ID format (UUID)
const isValidResourceId = (id) => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Generate mock resource for local mode
const generateMockResource = (id) => {
  return {
    id: id || uuidv4(),
    title: 'Sample Resource',
    description: 'This is a sample resource generated in local mode. The actual resource data could not be fetched.',
    url: 'https://example.com',
    thumbnail_url: 'https://via.placeholder.com/300x200?text=Sample+Resource',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'mock-user',
    category: 'Development',
    subcategory: 'Web Development',
    tags: ['sample', 'mock', 'local'],
    likes_count: 5,
    views_count: 10,
    user: {
      username: 'LocalUser',
      avatar_url: null
    }
  };
};

// Resource cache to reduce database load
const resourceCache = {
  data: {},
  timestamp: {},
  ttl: 5 * 60 * 1000, // 5 minute cache TTL
  
  // Get resource from cache if available and not expired
  get(resourceId) {
    const now = Date.now();
    if (this.data[resourceId] && now - this.timestamp[resourceId] < this.ttl) {
      return this.data[resourceId];
    }
    return null;
  },
  
  // Store resource in cache
  set(resourceId, resource) {
    this.data[resourceId] = resource;
    this.timestamp[resourceId] = Date.now();
  },
  
  // Clear cache for a specific resource
  clear(resourceId) {
    delete this.data[resourceId];
    delete this.timestamp[resourceId];
  }
};

const ResourcePage = () => {
  const { id } = useParams();
  const { user } = useUser();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [resource, setResource] = useState(null);
  const [relatedResources, setRelatedResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoadingFavorite, setIsLoadingFavorite] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [comments, setComments] = useState([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [error, setError] = useState(null);

  // Animation variants for elements
  const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.4 } }
  };
  
  const slideUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };
  
  const staggerChildren = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  // Set initial page title
  useEffect(() => {
    document.title = `${t('resource.viewingResource')} | Mindy`;
  }, [t]);
  
  // Update title when resource loads
  useEffect(() => {
    if (resource) {
      document.title = `${resource.title} | Mindy`;
    }
  }, [resource]);
  
  // Check for tab in URL
  useEffect(() => {
    if (location.search) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);
  
  // Fetch resource details
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      if (!mounted) return;
      setIsLoading(true);
      setError(null);
      
      if (!id) {
        console.error('Missing resource ID in URL');
        setError(t('errors.missingId', 'Missing resource ID'));
        setIsLoading(false);
        return;
      }
    
      // Check if resource is in cache
      const cachedResource = resourceCache.get(id);
      if (cachedResource) {
        console.log('Using cached resource data for', id);
        setResource(cachedResource);
        setIsLoading(false);
        
        // Get thumbnail and favicon
        const { thumbnailUrl: thumbUrl, faviconUrl: favUrl } = getResourceThumbnails(cachedResource);
        setThumbnailUrl(thumbUrl);
        setFaviconUrl(favUrl);
        
        // Check if favorited by user
        if (user) {
          checkFavoriteStatus(id);
        }
        
        // Fetch related resources and comments
        fetchRelatedResources(id, cachedResource.category);
        fetchComments(id);
        
        return;
      }
    
    try {
        // Use our utility function to get the resource by ID
        const result = await getResourceById(id);
        
        if (!result.success) {
          console.error('Error loading resource:', result.message || result.error);
          setError(result.message || t('errors.errorLoadingResource', 'Error loading resource'));
          setIsLoading(false);
          return;
        }
        
        let resourceData = result.data;
        
        // Handle the case where resourceData might be an array
        if (Array.isArray(resourceData)) {
          console.warn('Resource data returned as array, using first item');
          if (resourceData.length === 0) {
            setError(t('errors.resourceNotFound', 'Resource not found'));
            setIsLoading(false);
            return;
          }
          resourceData = resourceData[0];
        }
        
        // Verify we have valid resource data
        if (!resourceData || !resourceData.id || typeof resourceData !== 'object' || Array.isArray(resourceData)) {
          console.error('Invalid resource data returned:', resourceData);
          setError(t('errors.invalidData', 'Invalid resource data returned from database'));
          setIsLoading(false);
          return;
        }
        
        // Cache the resource data
        resourceCache.set(id, resourceData);
        setResource(resourceData);
        
        // Get thumbnail and favicon
        const { thumbnailUrl: thumbUrl, faviconUrl: favUrl } = getResourceThumbnails(resourceData);
        setThumbnailUrl(thumbUrl);
        setFaviconUrl(favUrl);
        
        // Get authentication status
        const authStatus = await checkAuthStatus();
        const isAuthenticated = authStatus.authenticated;
        
        // Track view - but don't let failures stop the page from loading
        try {
          await incrementViewCount(id);
        } catch (viewError) {
          // Just log the error and continue - don't block the page load
          console.warn('Failed to track view count (non-critical):', viewError);
        }
        
        // Check if favorited - only if authenticated
        if (isAuthenticated) {
          try {
            await checkFavoriteStatus(id);
          } catch (favoriteError) {
            // Just log the error and continue - don't block the page load
            console.warn('Failed to check favorite status (non-critical):', favoriteError);
          }
        }
        
        // Fetch related resources and comments - again, don't block page load on failure
        try {
          await fetchRelatedResources(id, resourceData.category);
        } catch (relatedError) {
          console.warn('Failed to fetch related resources (non-critical):', relatedError);
          setRelatedResources([]);
        }
        
        try {
          await fetchComments(id);
        } catch (commentsError) {
          console.warn('Failed to fetch comments (non-critical):', commentsError);
          setComments([]);
        }
      } catch (error) {
        console.error('Error in fetchData:', error);
        setError(error.message || t('errors.errorLoadingResource', 'Error loading resource'));
    } finally {
        if (mounted) {
      setIsLoading(false);
    }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [id, user, t]);
  
  // Check if the resource is favorited by the user
  const checkFavoriteStatus = async (resourceId) => {
    try {
      // Get current auth status
      const authStatus = await checkAuthStatus();
      if (!authStatus.authenticated) {
        console.warn('Cannot check favorite status: Not authenticated');
        return;
      }
      
      const { data, error } = await supabase
        .from('favorites')
        .select()
        .eq('user_id', user.id)
        .eq('resource_id', resourceId)
        .maybeSingle();
        
      if (error) {
        console.error('Error checking favorite status:', error);
        return;
      }
      
      setIsFavorited(!!data);
    } catch (error) {
      console.error('Unexpected error checking favorite status:', error);
    }
  };
  
  // Increment view count
  const incrementViewCount = async (resourceId) => {
    if (!resourceId) return;
    
    try {
      // First check if user is authenticated
      const authStatus = await checkAuthStatus();
      const userId = authStatus.authenticated ? authStatus.user?.id : null;
      
      const result = await trackResourceView(resourceId, userId);
      
      // If the view tracking fails for any reason, try a simple fallback
      if (!result.success) {
        // If unauthorized, just log it and do nothing else
        if (result.error === 'unauthorized' || 
            (result.error && result.error.code === '42501') || 
            (result.error && result.error.code === '401')) {
          console.warn('View tracking disabled due to permissions');
          return;
        }
      
        console.warn('Error tracking view, trying fallback:', result.error || result.message);
        
        try {
          // Perform a simple insert to resource_views as fallback
          const { error } = await supabase
            .from('resource_views')
            .insert({
              resource_id: resourceId,
              created_at: new Date().toISOString()
            });
            
          if (error && (error.code === '401' || error.status === 401 || error.code === '42501')) {
            console.warn('View tracking disabled due to permissions');
            return;
          }
        } catch (fallbackError) {
          // We tried our best, just log it
          console.warn('Fallback view tracking also failed:', fallbackError);
        }
      }
    } catch (error) {
      // Don't let view tracking errors affect the page load
      console.warn('Error tracking view (non-critical):', error);
    }
  };
  
  // Fetch related resources
  const fetchRelatedResources = async (resourceId, category) => {
    if (!resourceId) return;
    
    try {
      // Try to get resources in the same category first
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('category', category || '')
        .neq('id', resourceId)
        .limit(4);
        
      if (error) {
        console.error('Error fetching related resources:', error);
        setRelatedResources([]);
        return;
      }
      
      // Ensure data is an array
      const resourcesData = Array.isArray(data) ? data : (data ? [data] : []);
      
      // Get authentication status for user data fetching
      const authStatus = await checkAuthStatus();
      const isAuthenticated = authStatus.authenticated;
      
      // Process resources to add user data
      const processedResources = await Promise.all(
        (resourcesData || []).map(async (resource) => {
          // If resource already has user object, use it
          if (resource.user) {
            // If user is an array, take the first item
            if (Array.isArray(resource.user)) {
              resource.user = resource.user[0] || { 
                username: resource.user_id ? `User ${resource.user_id.substring(0, 5)}` : 'Anonymous',
                avatar_url: null
              };
            }
            return resource;
          }
          
          let userData = null;
          
          // Try to get user info if user_id exists
          if (resource.user_id) {
            try {
              // Try users table first
              const { data: userInfo, error: userError } = await supabase
                .from('users')
                .select('username, avatar_url')
                .eq('id', resource.user_id)
                .single();
              
              if (!userError && userInfo) {
                // Handle userInfo as array if needed
                userData = Array.isArray(userInfo) ? userInfo[0] : userInfo;
              } else {
                // Fallback to profiles table
                try {
                  const { data: profileInfo, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', resource.user_id)
                    .single();
                  
                  if (!profileError && profileInfo) {
                    // Handle profileInfo as array if needed
                    userData = Array.isArray(profileInfo) ? profileInfo[0] : profileInfo;
                  }
                } catch (profileError) {
                  console.warn('Failed to fetch profile data for resource:', profileError);
                }
              }
            } catch (userError) {
              console.warn('Failed to fetch user data for resource:', userError);
            }
          }
          
          // Return resource with user data or fallback
          return {
            ...resource,
            user: userData || {
              username: resource.user_id ? `User ${resource.user_id.substring(0, 5)}` : 'Anonymous',
              avatar_url: null
            }
          };
        })
      );
      
      if (processedResources && processedResources.length > 0) {
        setRelatedResources(processedResources);
      } else {
        // If no results, get any 4 resources
        const { data: anyData, error: anyError } = await supabase
        .from('resources')
        .select('*')
        .neq('id', resourceId)
        .limit(4);
        
        if (!anyError && anyData) {
          // Ensure anyData is an array
          const anyResourcesData = Array.isArray(anyData) ? anyData : (anyData ? [anyData] : []);
          
          // Process these resources too
          const processedAnyResources = await Promise.all(
            anyResourcesData.map(async (resource) => {
              // If resource already has user object, use it
              if (resource.user) {
                // If user is an array, take the first item
                if (Array.isArray(resource.user)) {
                  resource.user = resource.user[0] || { 
                    username: resource.user_id ? `User ${resource.user_id.substring(0, 5)}` : 'Anonymous',
                    avatar_url: null
                  };
                }
                return resource;
              }
              
              // Return resource with basic user data
              return {
                ...resource,
                user: {
                  username: resource.user_id ? `User ${resource.user_id.substring(0, 5)}` : 'Anonymous',
                  avatar_url: null
                }
              };
            })
          );
          
          setRelatedResources(processedAnyResources);
        } else {
          setRelatedResources([]);
        }
      }
    } catch (error) {
      console.error('Error fetching related resources:', error);
      setRelatedResources([]);
    }
  };
  
  // Fetch comments
  const fetchComments = async (resourceId) => {
    if (!resourceId) return;
    
    setIsLoadingComments(true);
    
      try {
        const { data, error } = await supabase
          .from('comments')
          .select('*')
          .eq('resource_id', resourceId)
          .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Ensure data is an array
      const commentsData = Array.isArray(data) ? data : (data ? [data] : []);
      
      // Process comments to ensure they have user data
      const processedComments = await Promise.all(
        (commentsData || []).map(async (comment) => {
          // If comment already has user object, use it
          if (comment.user) {
            // If user is an array, take the first item
            if (Array.isArray(comment.user)) {
              comment.user = comment.user[0] || { 
                username: comment.user_id ? `User ${comment.user_id.substring(0, 5)}` : 'Anonymous',
                avatar_url: null
              };
            }
            return comment;
          }
          
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
                // Handle userInfo as array if needed
                userData = Array.isArray(userInfo) ? userInfo[0] : userInfo;
              } else {
                // Fallback to profiles table
                try {
                  const { data: profileInfo, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', comment.user_id)
                    .single();
                  
                  if (!profileError && profileInfo) {
                    // Handle profileInfo as array if needed
                    userData = Array.isArray(profileInfo) ? profileInfo[0] : profileInfo;
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
        
      setComments(processedComments || []);
      } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error(t('common.error.comments', 'Failed to load comments'));
      setComments([]);
      } finally {
        setIsLoadingComments(false);
      }
  };
  
  // Toggle favorite
  const handleToggleFavorite = async () => {
    try {
      // Check authentication status first
      const authStatus = await checkAuthStatus();
      
      if (!authStatus.authenticated) {
        toast(t('auth.signInRequired'), { icon: '🔒' });
        return;
      }
      
      setIsLoadingFavorite(true);
      
      // Call the utility function with user ID from auth status
      const result = await toggleFavoriteUtil(resource.id, authStatus.user.id, isFavorited);
      
      if (result.success) {
        setIsFavorited(result.isFavorited);
        toast.success(result.isFavorited ? 
          t('resource.addedToFavorites', 'Added to favorites') : 
          t('resource.removedFromFavorites', 'Removed from favorites')
        );
      } else if (result.authError) {
        toast.error(t('auth.sessionExpired', 'Your session has expired. Please sign in again.'));
      } else {
        toast.error(t('common.error', 'An error occurred. Please try again.'));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error(t('common.error', 'An error occurred. Please try again.'));
    } finally {
      setIsLoadingFavorite(false);
    }
  };
  
  // Share resource
  const shareResource = () => {
    const shareUrl = `${window.location.origin}/resource/${resource.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: resource.title,
        text: resource.description,
        url: shareUrl,
      })
      .catch(() => {
        navigator.clipboard.writeText(shareUrl);
        toast.success(t('resource.share.copied'), { icon: '📋' });
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success(t('resource.share.copied'), { icon: '📋' });
    }
  };
  
  // Navigate to tag filter
  const handleTagClick = (tag) => {
    const encodedTag = encodeURIComponent(tag.trim());
    navigate(`/category/all?tag=${encodedTag}`);
  };
  
  // Open external URL
  const openExternalUrl = async () => {
    if (resource?.url) {
      // Track view before opening external URL - don't block URL opening if tracking fails
      try {
        await incrementViewCount(resource.id);
      } catch (error) {
        console.warn('Error tracking view for external URL (non-critical):', error);
      }
      
      // Open URL in new tab
      window.open(resource.url, '_blank', 'noopener,noreferrer');
    }
  };
  
  // Check if a tag is a software name
  const isSoftwareTag = (tag) => {
    const softwareTags = ['figma', 'photoshop', 'illustrator', 'after-effects', 'premiere', 'blender', 'cursor', 'indesign'];
    return softwareTags.includes(tag.toLowerCase());
  };
  
  // Handle back button click
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };
  
  // Make sure resource is never an array when used in the UI
  const ensureResource = (resource) => {
    if (!resource) return null;
    if (Array.isArray(resource)) {
      return resource.length > 0 ? resource[0] : null;
    }
    return resource;
  };
  
  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto px-4 py-16 min-h-screen flex items-center justify-center"
      >
        <div className="w-16 h-16 border-4 border-[#bfff58] border-solid rounded-full border-t-transparent animate-spin"></div>
      </motion.div>
    );
  }
  
  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center"
      >
        <h1 className="text-2xl font-bold text-white mb-4">{t('errors.error', 'Error')}</h1>
        <p className="text-gray-400 mb-8">{error}</p>
        <div className="flex space-x-4">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#bfff58] text-dark-900 rounded-md flex items-center shadow-lg transition-all duration-300"
          >
            <RefreshIcon className="w-4 h-4 mr-2" />
            {t('common.retry', 'Retry')}
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-dark-300 text-white rounded-md flex items-center transition-all duration-300"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            {t('common.backToHome', 'Back to Home')}
          </motion.button>
        </div>
      </motion.div>
    );
  }
  
  if (!resource) {
  return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center"
      >
        <h1 className="text-2xl font-bold text-white mb-4">{t('errors.resourceNotFound')}</h1>
        <p className="text-gray-400 mb-8">{t('errors.resourceNotFoundDesc')}</p>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-dark-300 text-white rounded-md flex items-center transition-all duration-300"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          {t('common.backToHome')}
        </motion.button>
      </motion.div>
    );
  }
  
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeIn}
    >
      <Helmet>
        <title>{resource.title} - Mindy</title>
        <meta name="description" content={resource.description || `${resource.title} - View details and related resources`} />
      </Helmet>
      
      <div className="container mx-auto px-4 py-6 md:py-12">
        {/* Back button and action buttons */}
        <motion.div 
          variants={slideUp}
          className="flex items-center justify-between mb-8"
        >
          <motion.button 
            whileHover={{ x: -3 }}
            onClick={handleBack}
            className="flex items-center text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            {t('ui.back')}
          </motion.button>
          
          <div className="flex items-center space-x-3">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleFavorite}
              disabled={isLoadingFavorite}
              className="flex items-center px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-all duration-300"
              aria-label={t(isFavorited ? 'resource.removeFavorite' : 'resource.addFavorite')}
            >
              {isFavorited ? (
                <HeartSolidIcon className="w-5 h-5 text-[#bfff58] mr-2" />
              ) : (
                <HeartIcon className="w-5 h-5 text-gray-400 mr-2" />
              )}
              <span className="hidden sm:inline">
                {t(isFavorited ? 'resource.saved' : 'resource.save')}
              </span>
            </motion.button>
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={shareResource}
              className="flex items-center px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-all duration-300"
              aria-label={t('resource.share')}
            >
              <ShareIcon className="w-5 h-5 text-gray-400 mr-2" />
              <span className="hidden sm:inline">{t('resource.share')}</span>
            </motion.button>
            
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openExternalUrl}
              className="flex items-center px-4 py-2 rounded-lg bg-[#bfff58] text-dark-900 hover:bg-[#bfff58]/90 transition-all duration-300 shadow-lg"
            >
              <ExternalLinkIcon className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">{t('resource.visitWebsite')}</span>
            </motion.a>
          </div>
        </motion.div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <motion.div 
            variants={slideUp}
            className="lg:col-span-2"
          >
            {/* Resource header */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="bg-dark-200 rounded-xl overflow-hidden shadow-xl"
            >
              {/* Resource image */}
              <div className="relative h-56 md:h-96 overflow-hidden">
                <motion.div
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.7 }}
                  className="h-full w-full"
                >
                  {resource.image_url ? (
                    <img 
                      src={resource.image_url} 
                alt={resource.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AutoThumbnail 
                      src={thumbnailUrl}
                      alt={resource.title}
                      url={resource.url}
                      title={resource.title}
                      category={resource.category || ''}
                      subcategory={resource.subcategory || ''}
                      tags={resource.tags || []}
                      className="w-full h-full object-cover"
                    />
                  )}
                </motion.div>
                
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-200 to-transparent"></div>
                
                {/* Action buttons */}
                <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between items-center">
                  <h1 className="text-2xl md:text-3xl font-bold text-white">{resource.title}</h1>
                
                  <div className="flex items-center space-x-3">
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={handleToggleFavorite}
                      disabled={isLoadingFavorite}
                      className="p-3 rounded-full bg-dark-300/80 hover:bg-dark-400 backdrop-blur-sm transition-all duration-300"
                      aria-label={isFavorited ? t('resource.removeFavorite') : t('resource.addFavorite')}
                    >
                      {isFavorited ? (
                        <HeartSolidIcon className="w-6 h-6 text-[#bfff58]" />
                      ) : (
                        <HeartIcon className="w-6 h-6 text-white" />
                      )}
                    </motion.button>
                  
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    onClick={shareResource}
                      className="p-3 rounded-full bg-dark-300/80 hover:bg-dark-400 backdrop-blur-sm transition-all duration-300"
                      aria-label={t('resource.share')}
                    >
                      <ShareIcon className="w-6 h-6 text-white" />
                    </motion.button>
              
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={openExternalUrl}
                      className="px-5 py-3 bg-[#bfff58] text-dark-900 rounded-lg text-sm font-medium hover:bg-[#bfff58]/90 transition-all duration-300 flex items-center shadow-lg"
                    >
                      {t('resource.visitWebsite')}
                      <ExternalLinkIcon className="w-4 h-4 ml-2" />
                    </motion.button>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <motion.div 
                variants={staggerChildren}
                className="p-6"
              >
                <motion.div variants={fadeIn} className="space-y-8">
                  {/* Description */}
                  {resource.description && (
                    <motion.div variants={slideUp}>
                      <h2 className="text-xl font-medium mb-4 text-white">{t('resource.description')}</h2>
                      <p className="text-gray-300 leading-relaxed">{resource.description}</p>
                    </motion.div>
                  )}
                  
                  {/* Tags */}
                  {resource.tags && resource.tags.length > 0 && (
                    <motion.div variants={slideUp}>
                      <h2 className="text-lg font-medium mb-4 text-white flex items-center">
                        <TagIcon className="w-5 h-5 mr-2 text-gray-400" />
                        {t('resource.tags')}
                      </h2>
                      <motion.div 
                        variants={staggerChildren}
                        className="flex flex-wrap gap-3"
                      >
                        {resource.tags.map((tag, index) => {
                          const translatedTag = t(`tags.${tag.toLowerCase()}`, tag);
                          
                          return (
                            <motion.button
                              key={tag}
                              variants={fadeIn}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: index * 0.05 }}
                              whileHover={{ scale: 1.05, backgroundColor: '#2a2a2a' }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleTagClick(tag)}
                              className="flex items-center px-4 py-2 rounded-md bg-dark-300 text-white transition-all duration-300 text-sm"
                            >
                              {isSoftwareTag(tag) && (
                                <SoftwareIcon name={tag} className="mr-2 w-4 h-4" />
                              )}
                              {translatedTag}
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    </motion.div>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
            
            {/* Comments Section */}
            <motion.div 
              variants={slideUp}
              className="mt-8"
            >
              <CommentSection
                resourceId={resource.id}
                comments={comments}
                isLoading={isLoadingComments}
                onCommentPosted={() => fetchComments(resource.id)}
              />
            </motion.div>
          </motion.div>
          
          {/* Sidebar */}
          <motion.div 
            variants={slideUp}
            className="lg:col-span-1"
          >
            {/* Related Resources */}
            <motion.div 
              variants={fadeIn}
              className="bg-dark-200 p-6 rounded-xl shadow-lg mb-6"
            >
              <h2 className="text-xl font-medium mb-6 text-white">{t('resource.related')}</h2>
              <RelatedResources 
                resources={relatedResources} 
                isLoading={isLoading}
              />
            </motion.div>
            
            {/* Resource Info */}
            <motion.div 
              variants={fadeIn}
              className="bg-dark-200 p-6 rounded-xl shadow-lg"
            >
              <h2 className="text-xl font-medium mb-6 text-white">{t('resource.information')}</h2>
              
              <div className="space-y-4">
                {resource.category && (
                  <div>
                    <h3 className="text-gray-400 text-sm mb-1">{t('resource.category')}</h3>
                    <p className="text-white">{resource.category}</p>
                  </div>
                )}
                
                {resource.subcategory && (
                  <div>
                    <h3 className="text-gray-400 text-sm mb-1">{t('resource.subcategory')}</h3>
                    <p className="text-white">{resource.subcategory}</p>
                  </div>
                )}
                
                {resource.created_at && (
                  <div>
                    <h3 className="text-gray-400 text-sm mb-1">{t('resource.addedOn')}</h3>
                    <p className="text-white">
                      {new Date(resource.created_at).toLocaleDateString()}
                      {' '}
                      ({formatDistanceToNow(new Date(resource.created_at), { addSuffix: true })})
                    </p>
                  </div>
                )}
                
                {resource.user && (
                  <div>
                    <h3 className="text-gray-400 text-sm mb-1">{t('resource.addedBy')}</h3>
                    <p className="text-white">{resource.user.username || t('user.anonymous')}</p>
                  </div>
                )}
                
                {faviconUrl && (
                  <div className="flex items-center mt-4">
                    <img 
                      src={faviconUrl} 
                      alt={resource.title} 
                      className="w-6 h-6 mr-2 rounded-sm"
                    />
                    <span className="text-gray-300 truncate">{new URL(resource.url).hostname}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default ResourcePage;