import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Auth0Provider } from '@auth0/auth0-react';
import './i18n'; // Import i18n configuration

import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Auth0Provider
      domain="cardmaker-dev.uk.auth0.com"
      clientId="12Z4xtf5Gl8MnVttMOtZISLcrhPfABUZ"
      authorizationParams={{
        redirect_uri: window.location.href,
      }}>
        <App />
    </Auth0Provider>
  </React.StrictMode>
);

serviceWorkerRegistration.register();
