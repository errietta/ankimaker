import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Cards from '../Cards';

// Build a mock JWT whose payload decodes to the given permissions
function makeToken(permissions: string[] = []) {
  const payload = btoa(JSON.stringify({ permissions }));
  return `header.${payload}.sig`;
}

const mockGetToken = jest.fn().mockResolvedValue(makeToken());

jest.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({ getAccessTokenSilently: mockGetToken }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Stub heavy child components
jest.mock('../LogoutButton', () => () => <button>Logout</button>);
jest.mock('../WritingCard', () => () => <div data-testid="writing-card" />);
jest.mock('../PhotoOCR', () => () => <div data-testid="photo-ocr" />);
jest.mock('../Settings', () => ({ settingsUpdated }: { settingsUpdated: (s: unknown) => void }) => (
  <div data-testid="settings" />
));

beforeEach(() => {
  localStorage.clear();
  mockGetToken.mockResolvedValue(makeToken());
});

describe('Cards – initial render', () => {
  it('renders the app title', async () => {
    render(<Cards />);
    await waitFor(() => expect(screen.getByText('welcome')).toBeInTheDocument());
  });

  it('shows an empty sentence textarea by default', async () => {
    render(<Cards />);
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas.length).toBeGreaterThanOrEqual(1);
      expect(textareas[0]).toHaveValue('');
    });
  });

  it('loads saved sentences from localStorage', async () => {
    localStorage.setItem('sentences', JSON.stringify([{ text: 'こんにちは', meaning: 'Hello', reading: 'こんにちは' }]));
    render(<Cards />);
    await waitFor(() => expect(screen.getByDisplayValue('こんにちは')).toBeInTheDocument());
  });
});

describe('Cards – sentence management', () => {
  it('adds a new sentence field when the add button is clicked', async () => {
    render(<Cards />);
    await waitFor(() => screen.getByText('add_sentence'));
    const before = screen.getAllByRole('textbox').length;
    await userEvent.click(screen.getByText('add_sentence'));
    expect(screen.getAllByRole('textbox').length).toBe(before + 1);
  });

  it('updates a sentence textarea when typed into', async () => {
    render(<Cards />);
    await waitFor(() => screen.getAllByRole('textbox'));
    const textarea = screen.getAllByRole('textbox')[0];
    await userEvent.type(textarea, '猫');
    expect(textarea).toHaveValue('猫');
  });

  it('persists sentences to localStorage on change', async () => {
    render(<Cards />);
    await waitFor(() => screen.getAllByRole('textbox'));
    await userEvent.type(screen.getAllByRole('textbox')[0], 'テスト');
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sentences') || '[]');
      expect(saved[0].text).toContain('テスト');
    });
  });

  it('clears all sentences when confirmed', async () => {
    localStorage.setItem('sentences', JSON.stringify([
      { text: '猫', meaning: 'cat', reading: 'ねこ' },
      { text: '犬', meaning: 'dog', reading: 'いぬ' },
    ]));
    jest.spyOn(window, 'confirm').mockReturnValueOnce(true);
    render(<Cards />);
    await waitFor(() => screen.getByDisplayValue('猫'));
    await userEvent.click(screen.getByText('clear_all'));
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas.length).toBe(1);
      expect(textareas[0]).toHaveValue('');
    });
  });

  it('does not clear sentences when the confirmation is cancelled', async () => {
    localStorage.setItem('sentences', JSON.stringify([{ text: '猫', meaning: 'cat', reading: 'ねこ' }]));
    jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    render(<Cards />);
    await waitFor(() => screen.getByDisplayValue('猫'));
    await userEvent.click(screen.getByText('clear_all'));
    expect(screen.getByDisplayValue('猫')).toBeInTheDocument();
  });
});

describe('Cards – tab navigation', () => {
  it('shows the Text tab content by default', async () => {
    render(<Cards />);
    await waitFor(() => {
      expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches to kanji writing tab', async () => {
    render(<Cards />);
    await waitFor(() => screen.getByText('tab_kanji_writing'));
    await userEvent.click(screen.getByText('tab_kanji_writing'));
    expect(screen.getByTestId('writing-card')).toBeInTheDocument();
  });

  it('switches to hanzi writing tab', async () => {
    render(<Cards />);
    await waitFor(() => screen.getByText('tab_hanzi_writing'));
    await userEvent.click(screen.getByText('tab_hanzi_writing'));
    expect(screen.getByTestId('writing-card')).toBeInTheDocument();
  });

  it('shows the OCR photo tab when the token grants use:photo-ocr', async () => {
    mockGetToken.mockResolvedValue(makeToken(['use:photo-ocr']));
    render(<Cards />);
    await waitFor(() => expect(screen.getByText('tab_photo')).toBeInTheDocument());
    await userEvent.click(screen.getByText('tab_photo'));
    expect(screen.getByTestId('photo-ocr')).toBeInTheDocument();
  });

  it('hides the OCR photo tab when the token lacks the permission', async () => {
    render(<Cards />);
    await waitFor(() => screen.getByText('tab_text'));
    expect(screen.queryByText('tab_photo')).not.toBeInTheDocument();
  });
});

describe('Cards – language selection', () => {
  it('defaults to Japanese (jp-JP)', async () => {
    render(<Cards />);
    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('jp-JP');
    });
  });

  it('loads saved language from localStorage', async () => {
    localStorage.setItem('translationLanguage', 'zh-CN');
    render(<Cards />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('zh-CN'));
  });

  it('persists language selection to localStorage when changed', async () => {
    render(<Cards />);
    await waitFor(() => screen.getByRole('combobox'));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'zh-CN');
    expect(localStorage.getItem('translationLanguage')).toBe('zh-CN');
  });
});
