import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import supabase, { checkSupabaseConnection } from './utils/supabase';
import { HelmetProvider } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { setupDatabase, checkDatabaseSetup } from './utils/setupDatabase';

// Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import ScrollToTop from './components/ui/ScrollToTop';
import PageTransition from './components/ui/PageTransition';

// Pages
import HomePage from './pages/HomePage';
import CategoryPage from './pages/CategoryPage';
import ResourcePage from './pages/ResourcePage';
import FavoritesPage from './pages/FavoritesPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import SubmitResourcePage from './pages/SubmitResourcePage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import TestPage from './pages/TestPage';
import UserJourneyTestPage from './pages/UserJourneyTestPage';
import StatusPage from './pages/StatusPage';

// Context
import { UserProvider } from './context/UserContext';
import { LanguageProvider } from './context/LanguageContext';
import { ResourcesProvider } from './context/ResourcesContext';

// AnimatedRoutes component to handle route transitions
const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <PageTransition>
            <HomePage />
          </PageTransition>
        } />
        <Route path="/category/:category" element={
          <PageTransition>
            <CategoryPage />
          </PageTransition>
        } />
        <Route path="/resource/:id" element={
          <PageTransition>
            <ResourcePage />
          </PageTransition>
        } />
        <Route path="/favorites" element={
          <PageTransition>
            <FavoritesPage />
          </PageTransition>
        } />
        <Route path="/profile" element={
          <PageTransition>
            <ProfilePage />
          </PageTransition>
        } />
        <Route path="/edit-profile" element={
          <PageTransition>
            <EditProfilePage />
          </PageTransition>
        } />
        <Route path="/submit" element={
          <PageTransition>
            <SubmitResourcePage />
          </PageTransition>
        } />
        <Route path="/admin" element={
          <PageTransition>
            <AdminPage />
          </PageTransition>
        } />
        <Route path="/status" element={
          <PageTransition>
            <StatusPage />
          </PageTransition>
        } />
        <Route path="/test-supabase" element={
          <PageTransition>
            <TestPage />
          </PageTransition>
        } />
        <Route path="/test-user-journey" element={
          <PageTransition>
            <UserJourneyTestPage />
          </PageTransition>
        } />
        <Route path="*" element={
          <PageTransition>
            <NotFoundPage />
          </PageTransition>
        } />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dbInitialized, setDbInitialized] = useState(false);

  // Helper function to load resources from Supabase
  const loadResourcesFromSupabase = async () => {
    try {
      console.log('Loading resources from Supabase...');
      
      // Fetch resources from Supabase with proper headers
      const { data: resources, error: resourcesError } = await supabase
        .from('resources')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (resourcesError) {
        console.error('Error fetching resources:', resourcesError);
        // Don't throw, continue with empty resources
        console.log('Continuing with empty resources');
        
        // Create empty resources array for the app to function
        try {
          localStorage.setItem('cachedResources', JSON.stringify([]));
        } catch (storageError) {
          console.warn('Failed to cache empty resources:', storageError);
        }
        
        return;
      }
      
      if (resources && resources.length > 0) {
        console.log(`Loaded ${resources.length} resources from Supabase.`);
        
        // Store resources in localStorage for offline use
        try {
          localStorage.setItem('cachedResources', JSON.stringify(resources));
          console.log('Resources cached to localStorage');
        } catch (storageError) {
          console.warn('Failed to cache resources to localStorage:', storageError);
        }
      } else {
        console.warn('No resources found in Supabase. Using empty resources array.');
        
        // Create empty resources array for the app to function
        try {
          localStorage.setItem('cachedResources', JSON.stringify([]));
        } catch (storageError) {
          console.warn('Failed to cache empty resources:', storageError);
        }
      }
    } catch (error) {
      console.error('Error loading resources from Supabase:', error);
      
      // Create empty resources array for the app to function
      try {
        localStorage.setItem('cachedResources', JSON.stringify([]));
        console.log('Created empty resources cache after error');
      } catch (storageError) {
        console.warn('Failed to cache empty resources:', storageError);
      }
    }
    
    // Set initialization complete regardless of success/failure
    setDbInitialized(true);
  };

  useEffect(() => {
    // Initialize database and check connection
    const initializeApp = async () => {
      try {
        console.log('Initializing app...');
        
        // Check if database is set up
        const isSetUp = await checkDatabaseSetup();
        
        if (!isSetUp) {
          console.log('Database not set up. Attempting to set up...');
          
          // Try to set up database
          try {
            const setupSuccess = await setupDatabase();
            
            if (setupSuccess) {
              console.log('Database setup successful');
              toast.success('Database connected successfully.');
              
              // Load data from the database after setup
              await loadResourcesFromSupabase();
            } else {
              console.warn('Database setup failed.');
              toast.error('Database setup failed.');
            }
          } catch (setupError) {
            console.error('Error setting up database:', setupError);
            toast.error('Failed to connect to database.');
          }
        } else {
          console.log('Database is set up. Loading data from Supabase...');
          
          // Load data from the database
          await loadResourcesFromSupabase();
          
          // Small toast to show we're using Supabase
          toast.success('Connected to Supabase database.', {
            duration: 2000,
            icon: '🚀'
          });
        }
        
        // App is initialized at this point
        setDbInitialized(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing app:', error);
        toast.error('Error initializing app. Please try again.');
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (isLoading) {
    return null; // The loading screen is already in index.html
  }

  return (
    <UserProvider>
      <LanguageProvider>
        <ResourcesProvider>
          <HelmetProvider>
            <BrowserRouter>
              <div className="app-container min-h-screen flex flex-col grid-bg minimal-scrollbar">
                <Navbar onOpenAuth={() => setShowAuthModal(true)} />
                
                <main id="main-content" className="flex-grow">
                  <AnimatedRoutes />
                </main>
                
                <Footer />
                
                <AuthModal 
                  isOpen={showAuthModal} 
                  onClose={() => setShowAuthModal(false)} 
                />
                
                <ScrollToTop />
              </div>
            </BrowserRouter>
          </HelmetProvider>
        </ResourcesProvider>
      </LanguageProvider>
    </UserProvider>
  );
}

export default App; 