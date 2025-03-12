import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HeartIcon, ShareIcon, ExternalLinkIcon, ChatAltIcon } from '@heroicons/react/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/solid';
import supabase from '../utils/supabase';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import GlassCard from './ui/GlassCard';
import AutoThumbnail from './ui/AutoThumbnail';
import SoftwareIcon from './ui/SoftwareIcon';
import { getWebsiteThumbnail, getWebsiteFavicon } from '../utils/thumbnailUtils';

export default function ResourceCard({ resource: resourceProp, delay = 0 }) {
  const { user } = useUser();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  // Handle case where resource might be an array
  const resource = Array.isArray(resourceProp) 
    ? (resourceProp.length > 0 ? resourceProp[0] : null) 
    : resourceProp;
  
  // Return early if no valid resource
  if (!resource || !resource.id) {
    console.error('Invalid resource data received in ResourceCard:', resourceProp);
    return null;
  }
  
  const [isFavorited, setIsFavorited] = useState(resource?.favorited || false);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(resource.image_url || null);
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [commentCount, setCommentCount] = useState(0);
  
  // Use refs to track if we've already performed certain operations
  const commentsFetched = useRef(false);
  const favoritesChecked = useRef(false);
  const thumbnailsFetched = useRef(false);
  const resourceIdRef = useRef(resource?.id);

  useEffect(() => {
    // Only run this effect if the resource ID changes or on first mount
    if (resourceIdRef.current !== resource?.id) {
      resourceIdRef.current = resource?.id;
      commentsFetched.current = false;
      favoritesChecked.current = false;
      thumbnailsFetched.current = false;
    }
    
    // Check if resource is favorited - only if not already checked
    if (user && resource?.id && !favoritesChecked.current) {
      favoritesChecked.current = true;
      const checkFavorite = async () => {
        try {
          console.log(`Checking favorite status for resource: ${resource.id} and user: ${user.id}`);
          
          // Check if user has favorited this resource
          const { data, error } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('resource_id', resource.id)
            .maybeSingle();
          
          if (error) throw error;
          
          // Set favorited state based on result
          setIsFavorited(!!data);
        } catch (err) {
          console.error('Error checking favorite status:', err);
        }
      };
      
      checkFavorite();
    }
    
    // Fetch comment count if not already fetched
    if (resource?.id && !commentsFetched.current) {
      commentsFetched.current = true;
      const fetchCommentCount = async () => {
        try {
          // First check if the comments table exists by doing a lightweight query
          const { error: tableCheckError } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .limit(1);
          
          // If there's a table-related error (like table not existing), just set count to 0 and exit
          if (tableCheckError) {
            console.log('Comments table may not exist yet, setting count to 0:', tableCheckError.message);
            setCommentCount(0);
            return;
          }
          
          // If table exists, proceed with actual count query
          const { count, error } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('resource_id', resource.id);
          
          if (error) {
            console.error('Error getting comment count:', error);
            // Still set a default value to prevent UI issues
            setCommentCount(0);
            return;
          }
          
          // Set the comment count from the result
          setCommentCount(count || 0);
        } catch (err) {
          // Handle any unexpected errors
          console.error('Exception fetching comment count:', err);
          // Set a default value to prevent UI issues
          setCommentCount(0);
        }
      };
      
      fetchCommentCount();
    }
    
    // Get thumbnails if needed
    if (!thumbnailsFetched.current && resource?.url) {
      thumbnailsFetched.current = true;
      
      // Get thumbnail if no image_url
      if (!resource.image_url) {
        try {
          // getWebsiteThumbnail returns a string directly, not a Promise
          const thumbnailUrl = getWebsiteThumbnail(resource.url);
          if (thumbnailUrl) {
            setThumbnailUrl(thumbnailUrl);
          }
        } catch (err) {
          console.error('Error fetching thumbnail:', err);
          setImageError(true);
        }
      }
      
      // Get favicon
      try {
        // getWebsiteFavicon is also synchronous
        const favicon = getWebsiteFavicon(resource.url);
        if (favicon) {
          setFaviconUrl(favicon);
        }
      } catch (err) {
        console.error('Error fetching favicon:', err);
      }
    }
  }, [resource, user]);
  
  // Track resource view
  const trackView = async () => {
    if (!user) return;
    
    try {
      // Try to use the resource_views table first
      const { error } = await supabase
        .from('resource_views')
        .insert([
          { resource_id: resource.id, user_id: user.id, created_at: new Date().toISOString() }
        ]);
      
      // If there's a permission error, just log it and continue
      if (error && (error.code === '401' || error.code === '42501' || error.status === 401)) {
        console.warn('View tracking disabled due to permissions');
        return;
      }
      
      if (error) {
        console.warn(`Failed to track view for resource ${resource.id}:`, error);
      } else {
        console.log(`View tracked for resource: ${resource.id}`);
      }
    } catch (error) {
      // Don't let tracking errors impact the user experience
      console.warn('Error tracking view (non-critical):', error);
    }
  };
  
  // Handle favorite toggle
  const handleFavorite = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isLoading || !user) return;
    
    setIsLoading(true);
    
    // Optimistic update
    setIsFavorited(prev => !prev);
    
    try {
      if (isFavorited) {
        // Remove favorite
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('resource_id', resource.id);
          
        if (error) throw error;
      } else {
        // Add favorite
        const { error } = await supabase
          .from('favorites')
          .insert({
            user_id: user.id,
            resource_id: resource.id
          });
          
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
      
      // Revert optimistic update on error
      setIsFavorited(prev => !prev);
      
      toast.error('Failed to update favorite status');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Share resource
  const shareResource = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const shareUrl = `${window.location.origin}/resource/${resource.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: resource.title,
          text: resource.description,
          url: shareUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
        copyToClipboard(shareUrl);
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };
  
  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast(t('resource.share.copied'), { icon: '📋' });
  };
  
  // Handle card click
  const handleCardClick = () => {
    // Ensure we have a valid resource with an ID
    if (!resource || !resource.id) {
      console.error('Invalid resource object:', resource);
      toast.error(t('errors.invalidResource', 'Invalid resource data'));
      return;
    }
    
    // Log the navigation for debugging
    console.log(`Navigating to resource page for: ${resource.title} (ID: ${resource.id})`);
    
    // Track view - make sure this completes even if there's an error
    try {
      trackView();
    } catch (error) {
      console.error('Error tracking view:', error);
      // Continue navigation even if tracking fails
    }
    
    // Navigate to resource page
    navigate(`/resource/${resource.id}`);
  };
  
  // Handle comments click
  const handleCommentsClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Navigate to resource page with comments tab active
    navigate(`/resource/${resource.id}?tab=comments`);
  };
  
  // Handle tag click
  const handleTagClick = (e, tag) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Ensure tag is properly encoded for URL
    const encodedTag = encodeURIComponent(tag.trim());
    navigate(`/category/all?tag=${encodedTag}`);
  };
  
  // Handle image error
  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(true);
    
    // Clear the thumbnailUrl on error to ensure we fall back to the generated thumbnail
    if (thumbnailUrl) {
      console.log(`Thumbnail error for resource: ${resource.title}`);
      setThumbnailUrl(null);
    }
  };
  
  if (!resource) return null;
  
  // External URL click
  const openExternalUrl = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (resource.url) {
      trackView();
      window.open(resource.url, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <>
      <div 
        className="group"
        style={{ animationDelay: `${delay * 0.1}s` }}
      >
        <GlassCard 
          className="relative overflow-hidden transition-all duration-300 cursor-pointer h-full"
          aria-label={t('resource.cardAriaLabel', { title: resource.title })}
        >
          <div 
            className="h-full w-full"
            onClick={handleCardClick}
          >
            {/* Spotlight effect */}
            <div className="spotlight" style={{ '--x': '50%', '--y': '50%' }}></div>
            
            {/* Resource Image */}
            <div className="relative aspect-video overflow-hidden rounded-t-xl bg-dark-300/50">
              <AutoThumbnail 
                src={thumbnailUrl} 
                alt={resource.title}
                url={resource.url}
                title={resource.title}
                category={resource.category || ''}
                subcategory={resource.subcategory || ''}
                tags={resource.tags || []}
                onError={handleImageError}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              
              {/* Favicon */}
              {faviconUrl && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-dark-100/80 backdrop-blur-sm p-1 shadow-lg">
                  <img 
                    src={faviconUrl} 
                    alt="Site icon" 
                    className="w-full h-full object-contain"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
              
              {/* Actions */}
              <div className="absolute top-2 right-2 flex space-x-1">
                <button 
                  onClick={handleFavorite}
                  disabled={isLoading}
                  className="p-1.5 rounded-full bg-dark-100/70 backdrop-blur-sm text-white/80 hover:text-lime-accent transition-colors duration-200"
                  aria-label={t(isFavorited ? 'resource.removeFavorite' : 'resource.addFavorite')}
                >
                  {isFavorited ? (
                    <HeartSolidIcon className="w-4 h-4 text-red-500" />
                  ) : (
                    <HeartIcon className="w-4 h-4 text-white" />
                  )}
                </button>
                
                <button 
                  onClick={shareResource}
                  className="p-1.5 rounded-full bg-dark-100/70 backdrop-blur-sm text-white/80 hover:text-lime-accent transition-colors duration-200"
                  aria-label={t('resource.share')}
                >
                  <ShareIcon className="w-4 h-4 text-white" />
                </button>
                
                <button 
                  onClick={openExternalUrl}
                  className="p-1.5 rounded-full bg-dark-100/70 backdrop-blur-sm text-white/80 hover:text-lime-accent transition-colors duration-200"
                  aria-label={t('resource.visit')}
                >
                  <ExternalLinkIcon className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-medium text-white group-hover:text-lime-accent transition-colors duration-200 line-clamp-2">
                  {resource.title}
                </h3>
              </div>
              
              <p className="mt-1 text-sm text-white/60 line-clamp-2">
                {resource.description}
              </p>
              
              {/* Tags */}
              {resource.tags && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(() => {
                    // Normalize tags to always be an array
                    let tagsArray = [];
                    
                    if (Array.isArray(resource.tags)) {
                      tagsArray = resource.tags;
                    } else if (typeof resource.tags === 'string') {
                      tagsArray = resource.tags.split(',').map(tag => tag.trim()).filter(Boolean);
                    }
                    
                    // Only show first 3 tags
                    const visibleTags = tagsArray.slice(0, 3).map((tag, index) => {
                      // Check if tag has a translation
                      const translatedTag = t(`tags.${tag.toLowerCase()}`, tag);
                      
                      return (
                        <button 
                          key={index} 
                          className="tag hover:bg-glass-200 transition-colors"
                          onClick={(e) => handleTagClick(e, tag)}
                        >
                          {tag.includes(':') ? (
                            <SoftwareIcon name={tag.split(':')[1]} className="mr-1" />
                          ) : null}
                          {tag.includes(':') ? tag.split(':')[1] : translatedTag}
                        </button>
                      );
                    });
                    
                    // Add the +X indicator if there are more than 3 tags
                    if (tagsArray.length > 3) {
                      visibleTags.push(
                        <span key="more" className="tag">+{tagsArray.length - 3}</span>
                      );
                    }
                    
                    return visibleTags;
                  })()}
                </div>
              )}
              
              {/* Footer */}
              <div className="mt-3 flex items-center justify-between text-xs text-white/50">
                <button 
                  className="flex items-center hover:text-white transition-colors"
                  onClick={handleCommentsClick}
                >
                  <ChatAltIcon className="w-3.5 h-3.5 mr-1" />
                  <span>{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
                </button>
                
                <div className="flex items-center">
                  <ExternalLinkIcon className="w-3.5 h-3.5 mr-1" />
                  <span className="truncate max-w-[120px]">
                    {resource.url ? (
                      (() => {
                        try {
                          // Ensure URL has a protocol
                          const urlToProcess = resource.url.startsWith('http') 
                            ? resource.url 
                            : `https://${resource.url}`;
                          return new URL(urlToProcess).hostname.replace('www.', '');
                        } catch (error) {
                          console.error('Invalid URL:', resource.url);
                          return 'Invalid URL';
                        }
                      })()
                    ) : 'No URL'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </>
  );
} 