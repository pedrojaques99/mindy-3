import { useState, useEffect } from 'react';
import supabase, { checkSupabaseConnection } from '../utils/supabase';
import { useLanguage } from '../context/LanguageContext';
import { setupDatabase } from '../utils/setupDatabase';
import toast from 'react-hot-toast';

const TestPage = () => {
  const { t, currentLanguage, changeLanguage, languages } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState('Checking...');
  const [translationsStatus, setTranslationsStatus] = useState('Checking...');
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [directQueryResult, setDirectQueryResult] = useState(null);

  useEffect(() => {
    // Only check connection if Supabase mode is forced
    const forceSupabase = localStorage.getItem('forceSupabaseConnection') === 'true';
    
    if (forceSupabase) {
      checkConnection();
    } else {
      setConnectionStatus('Disabled');
      setTranslationsStatus('Disabled');
      addTestResult('Connection mode', 'Info', 'Connection checks disabled for performance. Enable Supabase mode to test.');
    }
    
    // Get Supabase URL from environment
    const url = import.meta.env.VITE_SUPABASE_URL || 'Not available';
    setSupabaseUrl(url);
  }, []);

  const checkConnection = async () => {
    try {
      setIsLoading(true);
      setConnectionStatus('Checking...');
      
      // Check Supabase connection using the centralized function
      const isConnected = await checkSupabaseConnection(true); // Force a fresh check
      
      if (isConnected) {
        setConnectionStatus('Connected');
        addTestResult('Database connection', 'Success', 'Connected to Supabase');
      } else {
        setConnectionStatus('Disconnected');
        addTestResult('Database connection', 'Failed', 'Could not connect to Supabase');
        setIsLoading(false);
        return;
      }
      
      // Check if we have cached translation status to avoid unnecessary queries
      const cachedTranslationsStatus = localStorage.getItem('translationsStatus');
      const cachedTranslationsTime = localStorage.getItem('translationsStatusTime');
      const now = Date.now();
      
      // Use cached status if it's less than 5 minutes old
      if (cachedTranslationsStatus && cachedTranslationsTime && 
          (now - parseInt(cachedTranslationsTime)) < 5 * 60 * 1000) {
        
        console.log('Using cached translations status');
        const translationsData = JSON.parse(cachedTranslationsStatus);
        
        setTranslationsStatus(translationsData.status);
        addTestResult('Translations table', translationsData.result, translationsData.message);
      } else {
        // Check translations
        const { data, error } = await supabase
          .from('translations')
          .select('*')
          .limit(5);
          
        let statusData = {};
        
        if (error) {
          if (error.code === '42P01') {
            setTranslationsStatus('Not Created');
            statusData = {
              status: 'Not Created',
              result: 'Warning',
              message: 'Table does not exist yet. Use "Setup Database" to create it.'
            };
            addTestResult('Translations table', 'Warning', 'Table does not exist yet. Use "Setup Database" to create it.');
          } else {
            setTranslationsStatus('Error');
            statusData = {
              status: 'Error',
              result: 'Failed',
              message: error.message
            };
            addTestResult('Translations table', 'Failed', error.message);
          }
        } else if (!data || data.length === 0) {
          setTranslationsStatus('Empty');
          statusData = {
            status: 'Empty',
            result: 'Warning',
            message: 'No translations found. Use "Setup Database" to add translations.'
          };
          addTestResult('Translations table', 'Warning', 'No translations found. Use "Setup Database" to add translations.');
        } else {
          setTranslationsStatus('Available');
          statusData = {
            status: 'Available',
            result: 'Success',
            message: `Found ${data.length} translations`
          };
          addTestResult('Translations table', 'Success', `Found ${data.length} translations`);
        }
        
        // Cache the translations status
        localStorage.setItem('translationsStatus', JSON.stringify(statusData));
        localStorage.setItem('translationsStatusTime', now.toString());
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setConnectionStatus('Error');
      addTestResult('Connection test', 'Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const testDirectQuery = async () => {
    try {
      setIsLoading(true);
      addTestResult('Direct query', 'Running', 'Testing direct query...');
      
      const startTime = performance.now();
      
      // Try a simple direct query to a non-existent table
      // If we get a "relation does not exist" error, that's good!
      const { data, error } = await supabase
        .from('_dummy_query_for_connection_test_')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      if (error) {
        if (error.code === '42P01') {
          // This is actually good - it means we connected but the table doesn't exist
          addTestResult('Direct query', 'Success', `Connected to database (table does not exist, ${responseTime}ms)`);
          setDirectQueryResult(JSON.stringify(error, null, 2));
        } else {
          // Any other error is a problem
          addTestResult('Direct query', 'Failed', `${error.message} (${responseTime}ms)`);
          setDirectQueryResult(`Error: ${JSON.stringify(error, null, 2)}`);
        }
      } else {
        // If no error, we somehow have a _dummy_query_for_connection_test_ table!
        addTestResult('Direct query', 'Success', `Direct query successful (table exists!, ${responseTime}ms)`);
        setDirectQueryResult(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error('Error with direct query:', error);
      addTestResult('Direct query', 'Error', error.message);
      setDirectQueryResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const setupDatabaseTables = async () => {
    try {
      setIsLoading(true);
      addTestResult('Database setup', 'Running', 'Setting up database tables...');
      
      const success = await setupDatabase();
      
      if (success) {
        addTestResult('Database setup', 'Success', 'Database tables created successfully');
        toast.success('Database setup successful');
      } else {
        addTestResult('Database setup', 'Failed', 'Failed to set up database tables');
        toast.error('Database setup failed');
      }
      
      // Refresh connection status
      await checkConnection();
    } catch (error) {
      console.error('Error setting up database:', error);
      addTestResult('Database setup', 'Error', error.message);
      toast.error(`Database setup error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addTestResult = (test, status, message) => {
    setTestResults(prev => [
      { id: Date.now(), test, status, message, timestamp: new Date() },
      ...prev
    ]);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Toggle Supabase connection mode
  const toggleSupabaseMode = () => {
    const currentMode = localStorage.getItem('forceSupabaseConnection') === 'true';
    const newMode = !currentMode;
    
    localStorage.setItem('forceSupabaseConnection', newMode.toString());
    
    if (newMode) {
      toast.success('Supabase mode enabled. The app will use live data.');
      checkConnection();
    } else {
      toast.success('Local data mode enabled. Connection checks disabled for performance.');
      setConnectionStatus('Disabled');
      setTranslationsStatus('Disabled');
      addTestResult('Connection mode', 'Info', 'Connection checks disabled for performance. Enable Supabase mode to test.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-white">Database & Translation Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-dark-200 rounded-xl p-6 border border-dark-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Connection Status</h2>
            
            <button 
              onClick={toggleSupabaseMode}
              className={`flex items-center px-3 py-1 rounded-md text-xs transition-colors ${
                localStorage.getItem('forceSupabaseConnection') === 'true'
                  ? 'bg-lime-accent/20 text-lime-accent hover:bg-lime-accent/30'
                  : 'bg-dark-300 text-white/70 hover:bg-dark-400'
              }`}
            >
              <span className="mr-2">
                {localStorage.getItem('forceSupabaseConnection') === 'true'
                  ? 'Using Supabase'
                  : 'Using Local Data'}
              </span>
              <span className={`w-2 h-2 rounded-full ${
                localStorage.getItem('forceSupabaseConnection') === 'true'
                  ? 'bg-lime-accent'
                  : 'bg-white/30'
              }`}></span>
            </button>
          </div>
          
          <div className="mb-4">
            <p className="text-gray-400 mb-2">Supabase URL:</p>
            <code className="block p-2 bg-dark-300 rounded text-sm text-gray-300 overflow-x-auto">
              {supabaseUrl}
            </code>
          </div>
          
          <div className="flex items-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              connectionStatus === 'Connected' ? 'bg-green-500' : 
              connectionStatus === 'Disconnected' ? 'bg-red-500' : 
              connectionStatus === 'Checking...' ? 'bg-yellow-500' : 'bg-gray-500'
            }`}></div>
            <span className="text-gray-300">{connectionStatus}</span>
          </div>
          
          <div className="flex items-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              translationsStatus === 'Available' ? 'bg-green-500' : 
              translationsStatus === 'Empty' ? 'bg-yellow-500' : 
              translationsStatus === 'Error' ? 'bg-red-500' : 
              translationsStatus === 'Not Created' ? 'bg-orange-500' :
              translationsStatus === 'Checking...' ? 'bg-blue-500' : 'bg-gray-500'
            }`}></div>
            <span className="text-gray-300">Translations: {translationsStatus}</span>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-6">
            <button 
              onClick={checkConnection}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50"
            >
              Refresh Status
            </button>
            
            <button 
              onClick={setupDatabaseTables}
              disabled={isLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white disabled:opacity-50"
            >
              Setup Database
            </button>
            
            <button 
              onClick={testDirectQuery}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white disabled:opacity-50"
            >
              Test Direct Query
            </button>
          </div>
          
          {directQueryResult && (
            <div className="mt-4">
              <p className="text-gray-400 mb-2">Direct Query Result:</p>
              <pre className="p-3 bg-dark-300 rounded text-xs text-gray-300 overflow-x-auto max-h-40">
                {directQueryResult}
              </pre>
            </div>
          )}
        </div>
        
        <div className="bg-dark-200 rounded-xl p-6 border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-white">Translation Test</h2>
          
          <div className="mb-4">
            <p className="text-gray-400 mb-1">Current Language: {currentLanguage?.name || 'None'}</p>
            
            <div className="flex space-x-2 mt-3">
              {Object.values(languages).map(lang => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`px-3 py-1 rounded-lg ${
                    currentLanguage?.code === lang.code 
                      ? 'bg-[#bfff58] text-dark-100' 
                      : 'bg-dark-300 text-gray-300 hover:bg-dark-400'
                  }`}
                >
                  {lang.flag} {lang.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-dark-300 rounded-lg">
            <h3 className="font-medium text-white mb-2">Hero Title Translation:</h3>
            <p className="text-xl text-white">
              {t('home.hero.title', 'Discover')}{' '}
              <span className="text-[#bfff58]">
                {t('home.hero.titleHighlight', 'Creative Resources')}
              </span>{' '}
              {t('home.hero.titleEnd', 'for Your Projects')}
            </p>
            <p className="mt-2 text-gray-300">
              {t('home.hero.subtitle', 'Find the best tools, assets, and inspiration for designers, developers, and creators.')}
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-dark-200 rounded-xl p-6 border border-dark-300">
        <h2 className="text-xl font-semibold mb-4 text-white">Test Results</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-dark-300">
                <th className="py-2 px-4 text-gray-400">Time</th>
                <th className="py-2 px-4 text-gray-400">Test</th>
                <th className="py-2 px-4 text-gray-400">Status</th>
                <th className="py-2 px-4 text-gray-400">Message</th>
              </tr>
            </thead>
            <tbody>
              {testResults.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-4 text-center text-gray-500">No test results yet</td>
                </tr>
              ) : (
                testResults.map(result => (
                  <tr key={result.id} className="border-b border-dark-300">
                    <td className="py-2 px-4 text-gray-400">{formatTime(result.timestamp)}</td>
                    <td className="py-2 px-4 text-white">{result.test}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded-md text-xs ${
                        result.status === 'Success' ? 'bg-green-900/30 text-green-400' :
                        result.status === 'Failed' ? 'bg-red-900/30 text-red-400' :
                        result.status === 'Warning' ? 'bg-yellow-900/30 text-yellow-400' :
                        result.status === 'Running' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-gray-900/30 text-gray-400'
                      }`}>
                        {result.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-300">{result.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TestPage; 