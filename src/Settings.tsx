import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppSettings } from "./types/AppSettings";

interface SettingsComponentProps {
  settingsUpdated: (settings: AppSettings) => void;
  defaultSettings: AppSettings;
}

const SettingsComponent: React.FC<SettingsComponentProps> = ({ settingsUpdated, defaultSettings }) => {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(defaultSettings);

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  useEffect(() => {
    settingsUpdated(settings);
  }, [settings, settingsUpdated]);

  return (
    <div>
      <div style={{ display: showSettings ? 'block' : 'none'}} className="modal">
        <div className="modal-content">
          <span className="close" onClick={() => toggleSettings()}>&times;</span>
          <h2>{t('Settings')}</h2>
          <p>{t('Change settings')}</p>
          <form className="form">
            <label>
              {t('Anki Connect')}
              <input type="checkbox"
                checked={settings.ankConnect}
                onChange={(e) => {
                  const newSettings = { ...settings, ankConnect: e.target.checked };
                  setSettings(newSettings);
                }}
              />
            </label>
            <label>
              {t('Anki Connect URL')}
              <input type="text"
                value={settings.ankiConnectUrl}
                onChange={(e) => {
                  const newSettings = { ...settings, ankiConnectUrl: e.target.value };
                  setSettings(newSettings);
                }}
              />
            </label>
            <label>
              {t('Anki deck')}
              <input type="text"
                value={settings.ankiDeck}
                onChange={(e) => {
                  const newSettings = { ...settings, ankiDeck: e.target.value };
                  setSettings(newSettings);
                }}
              />
            </label>

            <input type="button" value={t("Save Settings")} onClick={(e) => {
              e.preventDefault();
              settingsUpdated(settings);
              toggleSettings();
            }} />
          </form>
        </div>
      </div>
      <button className="button button-alt" style={{ marginBottom: '10px' }} onClick={() => toggleSettings()}>{t('Settings')}</button>
    </div>
  );
};

export default SettingsComponent;
