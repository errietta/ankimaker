import { createCSV } from '../service/csv';

describe('createCSV', () => {
  it('starts with a UTF-8 BOM', () => {
    expect(createCSV([]).startsWith('﻿')).toBe(true);
  });

  it('includes a header row with Sentence, Reading, Meaning', () => {
    const csv = createCSV([]);
    expect(csv).toContain('Sentence');
    expect(csv).toContain('Reading');
    expect(csv).toContain('Meaning');
  });

  it('maps each card to a data row', () => {
    const csv = createCSV([
      { text: '猫が好き', reading: 'ねこがすき', meaning: 'I like cats' },
      { text: '犬', reading: 'いぬ', meaning: 'dog' },
    ]);
    expect(csv).toContain('猫が好き');
    expect(csv).toContain('ねこがすき');
    expect(csv).toContain('I like cats');
    expect(csv).toContain('犬');
    expect(csv).toContain('いぬ');
    expect(csv).toContain('dog');
  });

  it('returns only the header row for an empty list', () => {
    const csv = createCSV([]);
    const lines = csv.replace('﻿', '').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('produces one data row per card', () => {
    const cards = [
      { text: 'a', reading: 'b', meaning: 'c' },
      { text: 'd', reading: 'e', meaning: 'f' },
      { text: 'g', reading: 'h', meaning: 'i' },
    ];
    const csv = createCSV(cards);
    const lines = csv.replace('﻿', '').trim().split('\n');
    // header + 3 data rows
    expect(lines).toHaveLength(4);
  });
});
