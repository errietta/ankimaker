import { useAuth0 } from "@auth0/auth0-react";
import React, { useState, useEffect } from 'react';

import './App.css';
import Cards from './Cards';

import LanguageSwitcher from './LanguageSwitcher';
import LoginButton from './LoginButton';


function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline && isLoading) {
    return <div>Loading ...</div>;
  }

  return (
        <div>
          <LanguageSwitcher />
          { (isAuthenticated || isOffline) ? <Cards /> : <LoginButton />}
        </div>
  );
}

export default App;
