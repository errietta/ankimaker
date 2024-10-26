import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from 'react-i18next';

const LoginButton = () => {
    const { loginWithRedirect } = useAuth0();
    const { t } = useTranslation();

    return (
        <div className="login-container">
            <h1>{t('welcome')}</h1>
            <p>{t('login_message')}</p>
            <button className="login-button" onClick={() => loginWithRedirect()}>
                {t('log_in')}
            </button>
        </div>
    );
};

export default LoginButton;

