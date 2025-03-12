import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import supabase from '../utils/supabase';
import { useLanguage } from '../context/LanguageContext';
import SearchBar from '../components/SearchBar';
import FilterTags from '../components/FilterTags';
import ResourceCard from '../components/ResourceCard';
import toast from 'react-hot-toast';
import { ArrowLeftIcon, HomeIcon, ChevronRightIcon, XIcon } from '@heroicons/react/outline';

const CategoryPage = () => {
  const { category } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [categoryData, setCategoryData] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const ITEMS_PER_PAGE = 12;
  
  // Add refs to track if operations have been performed
  const dataFetched = useRef(false);
  const resourceCache = useRef({});
  
  // Parse query parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const searchParam = queryParams.get('search');
    const tagParam = queryParams.get('tag');
    const subcategoryParam = queryParams.get('subcategory');
    const filterParam = queryParams.get('filter');
    
    // Set search query if present
    if (searchParam) {
      setSearchQuery(searchParam);
    } else {
      setSearchQuery('');
    }
    
    // Set tag filters if present
    if (tagParam) {
      // Split comma-separated tags into an array
      const tags = tagParam.split(',').map(tag => tag.trim()).filter(Boolean);
      setSelectedTags(tags);
    } else {
      setSelectedTags([]);
    }
    
    // Set subcategory filter if present
    if (subcategoryParam) {
      setSelectedSubcategory(subcategoryParam);
    } else {
      setSelectedSubcategory(null);
    }
    
    // Reset pagination when URL changes
    setPage(0);
    setResources([]);
    setHasMore(true);
    setError(null);
    dataFetched.current = false;
    
    // Fetch data with the new filters
    fetchData();
  }, [location.search, category]);
  
  // Memoize fetchData to prevent recreation on each render
  const fetchData = useCallback(async () => {
    // Prevent multiple fetches in the same render cycle
    if (dataFetched.current) return;
    dataFetched.current = true;
    
    try {
      setLoading(true);
      setError(null);
      
      // Generate cache key based on current filters
      const urlParams = new URLSearchParams(location.search);
      const cacheKey = `${category}_${urlParams.toString()}_${page}`;
      
      // Check if we have cached data for this query
      if (resourceCache.current[cacheKey]) {
        console.log('Using cached data for', cacheKey);
        const cachedData = resourceCache.current[cacheKey];
        setCategoryData(cachedData.categoryData);
        setResources(cachedData.resources);
        setAllTags(cachedData.allTags);
        setSubcategories(cachedData.subcategories);
        setHasMore(cachedData.hasMore);
        setLoading(false);
        return;
      }
      
      // Fetch category data if not 'all'
      if (category !== 'all') {
        // Don't use .single() as it throws an error when no rows are found
        const { data: catData, error: catError } = await supabase
          .from('categories')
          .select('*')
          .eq('slug', category);
          
        if (catError) {
          console.error('Error fetching category data:', catError);
          // Handle specific error types
          if (catError.code === '42P01') {
            console.warn('Categories table does not exist');
          } else if (catError.code === 'PGRST301') {
            console.warn('Invalid category slug format');
          }
          
          // Create a default category based on the slug
          setCategoryData({
            name: t(`categories.${category}`, category.charAt(0).toUpperCase() + category.slice(1)),
            description: t('categories.description', 'Browse our curated collection of {category} resources', { category: t(`categories.${category}`, category) }),
            slug: category
          });
        } else if (catData && catData.length > 0) {
          setCategoryData(catData[0]);
        } else {
          // Create a default category object based on the slug
          setCategoryData({
            name: t(`categories.${category}`, category.charAt(0).toUpperCase() + category.slice(1)),
            description: t('categories.description', 'Browse our curated collection of {category} resources', { category: t(`categories.${category}`, category) }),
            slug: category
          });
        }
      }
      
      // Check if Supabase mode is forced
      const forceSupabase = localStorage.getItem('forceSupabaseConnection') === 'true';
      
      if (!forceSupabase) {
        // Generate mock data for local mode
        console.log('Using local data mode - loading mock resources');
        const mockResources = Array(ITEMS_PER_PAGE).fill().map((_, i) => ({
          id: `mock-${category}-${i}`,
          title: `${category.charAt(0).toUpperCase() + category.slice(1)} Resource ${i+1}`,
          description: 'This is a mock resource for local data mode',
          url: 'https://example.com',
          image_url: `https://picsum.photos/seed/${category}${i}/300/200`,
          category: category,
          subcategory: selectedSubcategory || `subcategory-${i % 3}`,
          tags: selectedTags.length > 0 ? selectedTags.join(',') : 'mock,local,design',
          likes: Math.floor(Math.random() * 100),
          created_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString()
        }));
        
        // Extract all unique tags from resources
        const tags = new Set();
        mockResources.forEach(resource => {
          if (resource.tags) {
            resource.tags.split(',').forEach(tag => tags.add(tag.trim()));
          }
        });
        
        // Extract all unique subcategories
        const subCats = new Set();
        mockResources.forEach(resource => {
          if (resource.subcategory) {
            subCats.add(resource.subcategory);
          }
        });
        
        setAllTags(Array.from(tags));
        setSubcategories(Array.from(subCats));
        setResources(mockResources);
        setHasMore(page < 2); // Only show 3 pages of mock data
        
        // Cache the results
        resourceCache.current[cacheKey] = {
          categoryData: categoryData,
          resources: mockResources,
          allTags: Array.from(tags),
          subcategories: Array.from(subCats),
          hasMore: page < 2
        };
        
        setLoading(false);
        return;
      }
      
      // Parse URL parameters
      const urlSearchQuery = urlParams.get('search');
      const urlTagQuery = urlParams.get('tag');
      const urlSubcategoryQuery = urlParams.get('subcategory');
      
      // Fetch resources with pagination
      let query = supabase
        .from('resources')
        .select('*');
      
      // Apply category filter
      if (category !== 'all') {
        // Filter directly by category
        query = query.eq('category', category);
      }
      
      // Apply search query filter if present in URL
      if (urlSearchQuery) {
        query = query.or(`title.ilike.%${urlSearchQuery}%,description.ilike.%${urlSearchQuery}%`);
      }
      
      // Apply subcategory filter if present - FIXED to use proper column name and comparison
      if (urlSubcategoryQuery) {
        query = query.eq('subcategory', urlSubcategoryQuery);
      }
      
      // Apply tag filtering at the database level if possible
      if (urlTagQuery) {
        const tags = urlTagQuery.split(',').map(tag => tag.trim()).filter(Boolean);
        if (tags.length === 1) {
          // For single tag, we can use contains in the query
          query = query.contains('tags', [tags[0]]);
        }
      }
      
      // Add pagination
      query = query.range(page * ITEMS_PER_PAGE, (page * ITEMS_PER_PAGE) + ITEMS_PER_PAGE - 1);
      
      const { data: resourcesData, error: resourcesError } = await query;
      
      if (resourcesError) {
        console.error('Error fetching resources:', resourcesError);
        
        // Handle specific error types
        if (resourcesError.code === '42P01') {
          setError('Resources table does not exist. Please check your database setup.');
        } else if (resourcesError.code === 'PGRST301') {
          setError('Invalid query format. Please check your filters.');
        } else if (resourcesError.message?.includes('Failed to fetch')) {
          setError('Network error. Please check your internet connection.');
        } else {
          setError('Failed to load resources. Please try again later.');
        }
        
        toast.error(t('common.error.loading', 'Failed to load resources'));
        setResources([]);
        setHasMore(false);
      } else {
        if (resourcesData.length < ITEMS_PER_PAGE) {
          setHasMore(false);
        }
        
        // For multiple tags, we need to filter in memory
        let filteredResources = resourcesData || [];
        if (urlTagQuery) {
          const tags = urlTagQuery.split(',').map(tag => tag.trim()).filter(Boolean);
          
          if (tags.length > 1) {
            filteredResources = resourcesData.filter(resource => {
              // Check if resource has all the selected tags
              return tags.every(tag => resource.tags && 
                (Array.isArray(resource.tags) 
                  ? resource.tags.includes(tag)
                  : resource.tags.split(',').map(t => t.trim()).includes(tag)
                )
              );
            });
          }
        }
        
        // Extract all unique tags from resources
        const tags = new Set();
        resourcesData.forEach(resource => {
          if (resource.tags) {
            if (Array.isArray(resource.tags)) {
              resource.tags.forEach(tag => tags.add(tag));
            } else {
              resource.tags.split(',').forEach(tag => tags.add(tag.trim()));
            }
          }
        });
        
        // Extract all unique subcategories
        const subCats = new Set();
        resourcesData.forEach(resource => {
          if (resource.subcategory) {
            subCats.add(resource.subcategory);
          }
        });
        
        setAllTags(Array.from(tags));
        setSubcategories(Array.from(subCats));
        setResources(filteredResources);
        
        // Cache the results
        resourceCache.current[cacheKey] = {
          categoryData: categoryData,
          resources: filteredResources,
          allTags: Array.from(tags),
          subcategories: Array.from(subCats),
          hasMore: resourcesData.length >= ITEMS_PER_PAGE
        };
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('An unexpected error occurred. Please try again later.');
      toast.error(t('common.error.loading', 'Failed to load resources'));
    } finally {
      setLoading(false);
    }
  }, [category, location.search, page, t, categoryData]);
  
  const loadMore = async () => {
    if (!hasMore || loading) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    
    // Reset the fetched flag to allow fetching the next page
    dataFetched.current = false;
    
    // Fetch data for the next page
    fetchData();
  };
  
  // Handle tag toggle
  const handleTagToggle = (tag) => {
    // Create a copy of the current selected tags
    let newTags = [...selectedTags];
    
    // Check if tag is already selected
    if (newTags.includes(tag)) {
      // Remove tag if already selected
      newTags = newTags.filter(t => t !== tag);
    } else {
      // Add tag if not already selected
      newTags.push(tag);
    }
    
    // Update URL with new tags
    const params = new URLSearchParams(location.search);
    
    if (newTags.length > 0) {
      params.set('tag', newTags.join(','));
    } else {
      params.delete('tag');
    }
    
    // Keep other parameters
    const searchParam = params.get('search');
    const subcategoryParam = params.get('subcategory');
    
    // Preserve filter parameter if it exists
    if (params.has('filter')) {
      params.set('filter', 'true');
    }
    
    // Navigate to updated URL
    navigate({
      pathname: `/category/${category}`,
      search: params.toString()
    });
    
    // Update state
    setSelectedTags(newTags);
    
    // Reset pagination
    setPage(0);
    setResources([]);
    setHasMore(true);
  };
  
  // Handle subcategory toggle
  const handleSubcategorySelect = (subcategory) => {
    const params = new URLSearchParams(location.search);
    
    if (selectedSubcategory === subcategory) {
      // Deselect if already selected
      params.delete('subcategory');
      setSelectedSubcategory(null);
    } else {
      // Select new subcategory
      params.set('subcategory', subcategory);
      setSelectedSubcategory(subcategory);
    }
    
    // Keep existing search term if any
    if (searchQuery) {
      params.set('search', searchQuery);
    }
    
    // Keep existing tags if any
    if (selectedTags.length > 0) {
      params.set('tag', selectedTags.join(','));
    }
    
    // Preserve filter parameter if it exists
    if (params.has('filter')) {
      params.set('filter', 'true');
    }
    
    // Update URL and trigger a page fetch
    navigate(`/category/${category}?${params.toString()}`);
    
    // Reset pagination
    setPage(0);
    setResources([]);
    setHasMore(true);
  };
  
  // Handle search
  const handleSearch = (query) => {
    setSearchQuery(query);
    
    // Update URL with search query
    const queryParams = new URLSearchParams(location.search);
    
    if (query) {
      queryParams.set('search', query);
    } else {
      queryParams.delete('search');
    }
    
    navigate(`${location.pathname}?${queryParams.toString()}`);
  };
  
  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedSubcategory(null);
    setPage(0);
    setResources([]);
    setHasMore(true);
    
    // Navigate without any query parameters
    navigate(`/category/${category}`);
    
    // Fetch fresh data
    fetchData();
  };
  
  return (
    <motion.div 
      className="container mx-auto px-4 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Navigation */}
      <div className="flex items-center mb-6 text-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center text-gray-400 hover:text-lime-accent transition-colors mr-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          <span>{t('common.back', 'Back')}</span>
        </button>
        
        <div className="flex items-center text-gray-400">
          <Link to="/" className="flex items-center hover:text-lime-accent transition-colors">
            <HomeIcon className="h-4 w-4 mr-1" />
            <span>{t('common.home', 'Home')}</span>
          </Link>
          
          <ChevronRightIcon className="h-3 w-3 mx-2" />
          
          <Link 
            to="/category/all" 
            className={`hover:text-lime-accent transition-colors ${
              category === 'all' && !selectedSubcategory ? 'text-lime-accent' : ''
            }`}
          >
            {t('common.resources', 'Resources')}
          </Link>
          
          {category !== 'all' && (
            <>
              <ChevronRightIcon className="h-3 w-3 mx-2" />
              <Link 
                to={`/category/${category}`}
                className={`hover:text-lime-accent transition-colors ${
                  !selectedSubcategory ? 'text-lime-accent' : ''
                }`}
              >
                {t(`categories.${category}`, categoryData?.name || category)}
              </Link>
            </>
          )}
          
          {selectedSubcategory && (
            <>
              <ChevronRightIcon className="h-3 w-3 mx-2" />
              <span className="text-lime-accent">{t(`subcategories.${selectedSubcategory}`, selectedSubcategory)}</span>
            </>
          )}
        </div>
      </div>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {category === 'all' ? t('categories.allResources', 'All Resources') : categoryData?.name || t(`categories.${category}`, category)}
          {selectedSubcategory && <span className="text-lime-accent"> / {t(`subcategories.${selectedSubcategory}`, selectedSubcategory)}</span>}
        </h1>
        <p className="text-gray-300">
          {category === 'all' 
            ? t('resources.browseAll', 'Browse our curated collection of resources')
            : categoryData?.description || t('categories.description', 'Browse our curated collection of {category} resources', { category: t(`categories.${category}`, category) })}
        </p>
      </div>
      
      <div className="glass-card p-4 mb-8">
        <div className="mb-4">
          <SearchBar 
            initialValue={searchQuery}
            onSearch={handleSearch}
            placeholder="Search in this category..."
          />
        </div>
        
        <FilterTags 
          tags={allTags}
          selectedTags={selectedTags}
          onToggleTag={handleTagToggle}
          onClearFilters={clearFilters}
        />
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#bfff58]"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="glass-card p-6 max-w-lg mx-auto">
            <h3 className="text-xl font-medium text-red-400 mb-3">Error Loading Resources</h3>
            <p className="text-gray-300 mb-4">{error}</p>
            <button 
              onClick={clearFilters}
              className="px-4 py-2 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-full text-white text-sm transition-colors"
            >
              Clear Filters & Try Again
            </button>
          </div>
        </div>
      ) : resources.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((resource, index) => (
              <ResourceCard 
                key={`${resource.id}-${index}`} 
                resource={resource} 
                delay={index % 9} // Stagger animation in groups of 9
              />
            ))}
          </div>
          
          {hasMore && (
            <div className="mt-8 text-center">
              <button 
                onClick={loadMore}
                className="px-6 py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] rounded-full text-white transition-colors"
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">No resources found matching your criteria.</p>
          <button 
            onClick={clearFilters}
            className="px-4 py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] rounded-full text-white text-sm transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default CategoryPage;
