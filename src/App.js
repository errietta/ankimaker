import { useAuth0 } from "@auth0/auth0-react";
import React, { useState, useEffect } from 'react';

import './App.css';
import Cards from './Cards';

import LanguageSwitcher from './LanguageSwitcher';
import LoginButton from './LoginButton';


function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { isAuthenticated, isLoading } = useAuth0();
  // Dark mode detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Dark mode sync
    const setDarkModeClass = (e) => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.toggle('dark-mode', isDark);
    };
    setDarkModeClass();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setDarkModeClass);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', setDarkModeClass);
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
