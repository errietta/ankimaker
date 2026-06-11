import { addSentencesToAnki, addWritingCardToAnki } from '../api/ankiConnect';
import { AppSettings } from '../types/AppSettings';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

const settings: AppSettings = {
  ankConnect: true,
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeck: 'TestDeck',
  ankiModel: 'Basic',
};

const okResponse = (body: unknown = { result: 1, error: null }) =>
  ({ ok: true, json: async () => body } as Response);

// ─── addSentencesToAnki ───────────────────────────────────────────────────────

describe('addSentencesToAnki', () => {
  beforeEach(() => mockFetch.mockReset());

  it('skips cards with missing text', async () => {
    await addSentencesToAnki([{ text: '', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips cards with missing meaning', async () => {
    await addSentencesToAnki([{ text: '猫', meaning: '', reading: 'ねこ' }], settings, 'jp-JP');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips cards with missing reading', async () => {
    await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: '' }], settings, 'jp-JP');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses "Tango Card Format" model for Japanese', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.note.modelName).toBe('Tango Card Format');
  });

  it('uses "Chinese deck" model for Chinese', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'māo' }], settings, 'zh-CN');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.note.modelName).toBe('Chinese deck');
  });

  it('maps card fields to Expression, Meaning, Reading', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    const fields = JSON.parse(mockFetch.mock.calls[0][1].body).params.note.fields;
    expect(fields).toEqual({ Expression: '猫', Meaning: 'cat', Reading: 'ねこ' });
  });

  it('uses the configured deck name', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.note.deckName).toBe('TestDeck');
  });

  it('returns a success result for a saved card', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    const results = await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    expect(results[0].success).toContain('猫');
  });

  it('returns an error result for a non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Bad Request', json: async () => ({}) } as Response);
    const results = await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    expect(results[0].error).toBeDefined();
  });

  it('returns an error result on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await addSentencesToAnki([{ text: '猫', meaning: 'cat', reading: 'ねこ' }], settings, 'jp-JP');
    expect(results[0].error).toBeDefined();
  });

  it('processes multiple cards independently', async () => {
    mockFetch.mockResolvedValue(okResponse());
    const cards = [
      { text: '猫', meaning: 'cat', reading: 'ねこ' },
      { text: '犬', meaning: 'dog', reading: 'いぬ' },
    ];
    const results = await addSentencesToAnki(cards, settings, 'jp-JP');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });
});

// ─── addWritingCardToAnki ─────────────────────────────────────────────────────

describe('addWritingCardToAnki', () => {
  const jpCard = { word: '猫', reading: 'ねこ', sentence: '猫が好き', level: '5', meaning: 'cat', diagramBase64: null };
  const cnCard = { word: '猫', reading: 'māo', sentence: '猫很可爱', level: '3', meaning: 'cat', diagramBase64: null };

  beforeEach(() => mockFetch.mockReset());

  it('uses "Writing Cards Japanese" model for jp-JP', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.note.modelName).toBe('Writing Cards Japanese');
  });

  it('uses "Writing Cards Chinese" model for zh-CN', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(cnCard, settings, 'zh-CN');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params.note.modelName).toBe('Writing Cards Chinese');
  });

  it('maps Japanese fields correctly', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    const fields = JSON.parse(mockFetch.mock.calls[0][1].body).params.note.fields;
    expect(fields.Kanji).toBe('猫');
    expect(fields.Kana).toBe('ねこ');
    expect(fields.KankenLevel).toBe('5');
  });

  it('maps Chinese fields correctly', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(cnCard, settings, 'zh-CN');
    const fields = JSON.parse(mockFetch.mock.calls[0][1].body).params.note.fields;
    expect(fields.Hanzi).toBe('猫');
    expect(fields.Pinyin).toBe('māo');
    expect(fields.HSKLevel).toBe('3');
  });

  it('builds SentenceFront by replacing the word with its reading', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    const fields = JSON.parse(mockFetch.mock.calls[0][1].body).params.note.fields;
    expect(fields.SentenceFront).toBe('ねこが好き');
    expect(fields.SentenceBack).toBe('猫が好き');
  });

  it('attaches a picture when diagramBase64 is provided', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki({ ...jpCard, diagramBase64: 'base64data' }, settings, 'jp-JP');
    const note = JSON.parse(mockFetch.mock.calls[0][1].body).params.note;
    expect(note.picture).toBeDefined();
    expect(note.picture[0].data).toBe('base64data');
    expect(note.picture[0].fields).toContain('Diagram');
  });

  it('omits picture when diagramBase64 is null', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    const note = JSON.parse(mockFetch.mock.calls[0][1].body).params.note;
    expect(note.picture).toBeUndefined();
  });

  it('returns success when the API call succeeds', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ result: 1 }) } as Response);
    const result = await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    expect(result.success).toContain('猫');
  });

  it('returns the error string when the API returns an error', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ error: 'duplicate note' }) } as Response);
    const result = await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    expect(result.error).toBe('duplicate note');
  });

  it('returns an error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await addWritingCardToAnki(jpCard, settings, 'jp-JP');
    expect(result.error).toBeDefined();
  });
});
