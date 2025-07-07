
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const SettingsComponent = ({settingsUpdated, defaultSettings}) => {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = React.useState(false);
  const [settings, setSettings] = React.useState(defaultSettings);


  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  useEffect(() => {
    settingsUpdated(settings);
  }, [settings, settingsUpdated]);


  return (
    <div>
      <div style={{ display: showSettings ? 'block' : 'none'}} class="modal">
        <div class="modal-content">
          <span class="close" onClick={() => toggleSettings()}>&times;</span>
          <h2>{t('Settings')}</h2>
          <p>{t('Change settings')}</p>
          <form class="form">
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
            <label>
              {t('Anki model')}
              <select onChange={(e) => {
                const newSettings = { ...settings, ankiModel: e.target.value };
                setSettings(newSettings);
              }} value={settings.ankiModel}>
                <option value="Basic">Basic</option>
                <option value="Cloze">Cloze</option>
                <option value="Basic (and reverse)">Basic (and reverse)</option>
                <option value="Basic (optional reversed card)">Basic (optional reversed card)</option>
                <option value="Basic (type in the answer)">Basic (type in the answer)</option>
                <option value="Tango Card Format">Tango Card Format</option>
              </select>
            </label>

            <input type="button" value="Save Settings" onClick={(e) => {
              e.preventDefault();
              settingsUpdated(settings);
              toggleSettings();
            }} />
          </form>
        </div>
      </div>
      <button className="button button-alt" style={{'marginBottom': '10px'}} onClick={() => toggleSettings()}>Settings</button>
    </div>
  );
};

export default SettingsComponent;

