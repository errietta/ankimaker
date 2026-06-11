import { ApiClient } from '../api/meaning';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

const mockResponse = (body: unknown) => ({
  json: async () => body,
  ok: true,
} as Response);

describe('ApiClient.getSentenceMeaning', () => {
  beforeEach(() => mockFetch.mockReset());

  it('posts to the /meaning endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('tok').getSentenceMeaning({ text: '猫', reading: '', meaning: '' });
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/meaning$/);
  });

  it('sends the sentence text and language in the request body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('tok').getSentenceMeaning({ text: '猫', reading: '', meaning: '' }, 'zh-CN');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ text: '猫', language: 'zh-CN' });
  });

  it('defaults language to jp-JP', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('tok').getSentenceMeaning({ text: '猫', reading: '', meaning: '' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.language).toBe('jp-JP');
  });

  it('sets the Authorization header with the access token', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('my-secret-token').getSentenceMeaning({ text: '猫', reading: '', meaning: '' });
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer my-secret-token');
  });

  it('returns the API response', async () => {
    const reply = { sentence: '猫が好き', reading: 'ねこがすき', meaning: 'I like cats' };
    mockFetch.mockResolvedValueOnce(mockResponse({ reply }));
    const result = await new ApiClient('tok').getSentenceMeaning({ text: '猫が好き', reading: '', meaning: '' });
    expect(result.reply).toEqual(reply);
  });
});

describe('ApiClient.getPhotoMeaning', () => {
  beforeEach(() => mockFetch.mockReset());

  it('posts to the /meaning/photo endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ prompt: '', reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('tok').getPhotoMeaning('abc', 'image/jpeg');
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/meaning\/photo$/);
  });

  it('sends imageBase64, mimeType and language in the request body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ prompt: '', reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('tok').getPhotoMeaning('abc123', 'image/png', 'zh-CN');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ imageBase64: 'abc123', mimeType: 'image/png', language: 'zh-CN' });
  });

  it('sets the Authorization header with the access token', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ prompt: '', reply: { sentence: '', reading: '', meaning: '' } }));
    await new ApiClient('photo-token').getPhotoMeaning('abc', 'image/jpeg');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer photo-token');
  });
});
