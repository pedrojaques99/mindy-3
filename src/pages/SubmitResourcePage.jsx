import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useUser } from '../context/UserContext';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';

const SubmitResourcePage = () => {
  const { user } = useUser();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url: '',
    image_url: '',
    category: '',
    subcategory: '',
    tags: '',
  });
  
  useEffect(() => {
    // Fetch categories and subcategories
    const fetchCategoriesData = async () => {
      try {
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('*')
          .order('name');
          
        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);
        
        // Fetch subcategories
        const { data: subcategoriesData, error: subcategoriesError } = await supabase
          .from('subcategories')
          .select('*')
          .order('name');
          
        if (subcategoriesError) throw subcategoriesError;
        setSubcategories(subcategoriesData || []);
      } catch (error) {
        console.error('Error fetching categories/subcategories:', error);
        toast.error(t('submit.errors.loadCategories', 'Failed to load categories'));
        
        // Fallback to local mode if there's a network error
        if (error.message === 'Failed to fetch' || error.message?.includes('network')) {
          localStorage.setItem('forceSupabaseConnection', 'false');
          
          // Set mock categories and subcategories for local mode
          setCategories([
            { id: 1, name: 'Design', slug: 'design' },
            { id: 2, name: 'Development', slug: 'development' },
            { id: 3, name: 'Marketing', slug: 'marketing' },
            { id: 4, name: 'Productivity', slug: 'productivity' }
          ]);
          
          setSubcategories([
            { id: 1, name: 'UI Design', slug: 'ui-design', category_id: 1 },
            { id: 2, name: 'UX Design', slug: 'ux-design', category_id: 1 },
            { id: 3, name: 'Web Development', slug: 'web-development', category_id: 2 },
            { id: 4, name: 'Mobile Development', slug: 'mobile-development', category_id: 2 }
          ]);
        }
      }
    };
    
    fetchCategoriesData();
  }, [t]);
  
  // Filter subcategories based on selected category
  const filteredSubcategories = formData.category 
    ? subcategories.filter(sub => {
        const category = categories.find(cat => cat.slug === formData.category);
        return category && sub.category_id === category.id;
      })
    : [];
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Reset subcategory when category changes
    if (name === 'category') {
      setFormData(prev => ({ ...prev, subcategory: '' }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      toast.error(t('submit.errors.notSignedIn', 'You must be signed in to submit a resource'));
      return;
    }
    
    try {
      setLoading(true);
      
      // Process tags
      const tagsArray = formData.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag);
      
      // Prepare resource data
      const resourceData = {
        title: formData.title,
        description: formData.description,
        url: formData.url,
        image_url: formData.image_url || null,
        category: formData.category,
        subcategory: formData.subcategory || null,
        tags: tagsArray,
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Check if we're in local mode
      const forceSupabase = localStorage.getItem('forceSupabaseConnection') === 'true';
      if (!forceSupabase) {
        // Mock submission for local mode
        console.log('Local mode: Resource would be submitted with data:', resourceData);
        toast.success(t('submit.success', 'Resource submitted successfully!'));
        navigate('/');
        return;
      }
      
      // Submit resource
      const { data, error } = await supabase
        .from('resources')
        .insert([resourceData])
        .select();
        
      if (error) throw error;
      
      toast.success(t('submit.success', 'Resource submitted successfully!'));
      navigate('/');
    } catch (error) {
      console.error('Error submitting resource:', error);
      
      // Check for specific error types
      if (error.code === 'PGRST204') {
        toast.error('Database schema error. Please contact support.');
      } else if (error.message === 'Failed to fetch' || error.message?.includes('network')) {
        toast.error('Network error. Switching to local mode.');
        localStorage.setItem('forceSupabaseConnection', 'false');
        
        // Try again in local mode
        setTimeout(() => handleSubmit(e), 500);
      } else {
        toast.error(t('submit.errors.submitFailed', 'Failed to submit resource'));
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">{t('submit.title', 'Submit a Resource')}</h1>
        
        <div className="glass-card p-6 mb-8">
          <p className="text-white/70 mb-4">
            {t('submit.description', 'Share a valuable resource with the community. All submissions are reviewed before being published.')}
          </p>
          
          {!user && (
            <div className="bg-dark-400 p-4 rounded-lg mb-6">
              <p className="text-white/70 mb-2">
                {t('submit.signInRequired', 'You need to be signed in to submit a resource.')}
              </p>
              <button 
                onClick={() => navigate('/')}
                className="text-lime-accent hover:underline"
              >
                {t('common.signIn', 'Sign in')}
              </button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                {t('submit.form.title', 'Title')} *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                required
                disabled={!user || loading}
              />
            </div>
            
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                {t('submit.form.description', 'Description')} *
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                required
                disabled={!user || loading}
              />
            </div>
            
            <div>
              <label htmlFor="url" className="block text-sm font-medium mb-1">
                {t('submit.form.url', 'URL')} *
              </label>
              <input
                id="url"
                name="url"
                type="url"
                value={formData.url}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                required
                disabled={!user || loading}
              />
            </div>
            
            <div>
              <label htmlFor="image_url" className="block text-sm font-medium mb-1">
                {t('submit.form.imageUrl', 'Image URL')}
              </label>
              <input
                id="image_url"
                name="image_url"
                type="url"
                value={formData.image_url}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                disabled={!user || loading}
              />
              <p className="text-white/50 text-xs mt-1">
                {t('submit.form.imageUrlHelp', 'Optional. Leave blank to use a default image.')}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="category" className="block text-sm font-medium mb-1">
                  {t('submit.form.category', 'Category')} *
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                  required
                  disabled={!user || loading}
                >
                  <option value="">{t('submit.form.selectCategory', 'Select a category')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="subcategory" className="block text-sm font-medium mb-1">
                  {t('submit.form.subcategory', 'Subcategory')}
                </label>
                <select
                  id="subcategory"
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                  disabled={!formData.category || !user || loading}
                >
                  <option value="">{t('submit.form.selectSubcategory', 'Select a subcategory (optional)')}</option>
                  {filteredSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.slug}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label htmlFor="tags" className="block text-sm font-medium mb-1">
                {t('submit.form.tags', 'Tags')}
              </label>
              <input
                id="tags"
                name="tags"
                type="text"
                value={formData.tags}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-400 border border-glass-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-accent"
                disabled={!user || loading}
              />
              <p className="text-white/50 text-xs mt-1">
                {t('submit.form.tagsHelp', 'Separate tags with commas (e.g., design, tools, productivity)')}
              </p>
            </div>
            
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={!user || loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('submit.form.submitting', 'Submitting...')}
                </span>
              ) : (
                t('submit.form.submit', 'Submit Resource')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SubmitResourcePage;
