import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsComponent from '../Settings';
import { AppSettings } from '../types/AppSettings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const defaults: AppSettings = {
  ankConnect: true,
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeck: 'Default',
  ankiModel: 'Basic',
};

describe('SettingsComponent', () => {
  it('renders the Settings button', () => {
    render(<SettingsComponent settingsUpdated={jest.fn()} defaultSettings={defaults} />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('modal is hidden by default', () => {
    render(<SettingsComponent settingsUpdated={jest.fn()} defaultSettings={defaults} />);
    expect(document.querySelector('.modal')).toHaveStyle({ display: 'none' });
  });

  it('opens modal when Settings button is clicked', async () => {
    render(<SettingsComponent settingsUpdated={jest.fn()} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(document.querySelector('.modal')).toHaveStyle({ display: 'block' });
  });

  it('closes modal when the × button is clicked', async () => {
    render(<SettingsComponent settingsUpdated={jest.fn()} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByText('×'));
    expect(document.querySelector('.modal')).toHaveStyle({ display: 'none' });
  });

  it('calls settingsUpdated with the new value when the checkbox changes', async () => {
    const onUpdate = jest.fn();
    render(<SettingsComponent settingsUpdated={onUpdate} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ ankConnect: false }));
  });

  it('calls settingsUpdated when the URL input is changed', async () => {
    const onUpdate = jest.fn();
    render(<SettingsComponent settingsUpdated={onUpdate} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const urlInput = screen.getByDisplayValue('http://localhost:8765');
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, 'http://localhost:9000');
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ ankiConnectUrl: 'http://localhost:9000' }));
  });

  it('calls settingsUpdated when the deck name is changed', async () => {
    const onUpdate = jest.fn();
    render(<SettingsComponent settingsUpdated={onUpdate} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const deckInput = screen.getByDisplayValue('Default');
    await userEvent.clear(deckInput);
    await userEvent.type(deckInput, 'MyDeck');
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ ankiDeck: 'MyDeck' }));
  });

  it('closes modal after clicking Save Settings', async () => {
    render(<SettingsComponent settingsUpdated={jest.fn()} defaultSettings={defaults} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByDisplayValue('Save Settings'));
    expect(document.querySelector('.modal')).toHaveStyle({ display: 'none' });
  });
});
