import { useAuth0 } from "@auth0/auth0-react";

import './App.css';
import Cards from './Cards';

import LanguageSwitcher from './LanguageSwitcher';
import LoginButton from './LoginButton';


function App() {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return <div>Loading ...</div>;
  }

    return (
          <div>
            <LanguageSwitcher />
            {isAuthenticated ? <Cards /> : <LoginButton />}
          </div>
    );
}

export default App;
