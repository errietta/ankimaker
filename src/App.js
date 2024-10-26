import React, { useState, useEffect } from 'react';
import { useAuth0 } from "@auth0/auth0-react";

import './App.css';
import Cards from './Cards';
import LoginButton from './LoginButton';


function App() {
  const { user, isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div>Loading ...</div>;
  }

  return isAuthenticated ? <Cards /> : <LoginButton/> ;
}

export default App;
