import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import './LoginButton.css'; 

const LoginButton = () => {
    const { loginWithRedirect } = useAuth0();

    return (
      <div className="login-container">
        <h1>Welcome to Study Card Generator</h1>
        <p>Please log in to continue.</p>
        <button className="login-button" onClick={() => loginWithRedirect()}>
          Log In
        </button>
      </div>
    );
};



export default LoginButton;
