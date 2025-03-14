import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import supabase from '../utils/supabase';
import { useUser } from '../context/UserContext';
import ResourceCard from '../components/ResourceCard';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';

const FavoritesPage = () => {
  const { user } = useUser();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchFavorites = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select('*, resources(*)')
          .eq('user_id', user.id);
          
        if (error) throw error;
        
        // Process the data to ensure resource has favorited property
        const processedData = (data || []).map(favorite => ({
          ...favorite,
          resources: {
            ...favorite.resources,
            favorited: true // Mark as favorited for the ResourceCard component
          }
        }));
        
        setFavorites(processedData);
      } catch (error) {
        console.error('Error fetching favorites:', error);
        toast.error(t('favorites.errors.loadFavorites', 'Failed to load favorites'));
      } finally {
        setLoading(false);
      }
    };
    
    fetchFavorites();
  }, [user, t]);
  
  const handleRemoveFavorite = async (favoriteId) => {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', favoriteId);
        
      if (error) throw error;
      
      // Update local state
      setFavorites(favorites.filter(fav => fav.id !== favoriteId));
      toast.success(t('favorites.removed', 'Removed from favorites'));
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast.error(t('favorites.errors.removeFavorite', 'Failed to remove from favorites'));
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <div className="spinner"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t('favorites.title', 'Your Favorites')}</h1>
      
      {!user ? (
        <div className="glass-card p-6 text-center">
          <p className="text-white/70 mb-4">
            {t('favorites.signInPrompt', 'Sign in to save and view your favorite resources.')}
          </p>
          <button 
            onClick={() => navigate('/')}
            className="btn btn-primary"
          >
            {t('common.signIn', 'Sign In')}
          </button>
        </div>
      ) : favorites.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <p className="text-white/70 mb-4">
            {t('favorites.empty', "You haven't added any favorites yet.")}
          </p>
          <Link to="/" className="btn btn-primary">
            {t('favorites.browseResources', 'Browse Resources')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((favorite, index) => (
            <ResourceCard 
              key={favorite.id} 
              resource={favorite.resources} 
              delay={index * 0.1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
