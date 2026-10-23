import { LOANWORDS } from '../data/loanwords.js';
import { createMatcher, toReports, type DictionaryOptions } from './dictionary.js';
import { defineRule } from './types.js';

const match = createMatcher(LOANWORDS);

export default defineRule<DictionaryOptions>({
  id: 'loanword',
  description: 'なじみのうすい外来語を使っていないか',
  guideline: 'p.5「なじみのうすい外来語等は避ける」',
  defaultSeverity: 'warning',
  defaultOptions: { words: {}, exclude: [] },
  check({ masked, options }) {
    return toReports(
      match(masked, options),
      (word, suggestion) => `なじみのうすい外来語「${word}」は避けてください。「${suggestion}」のように言いかえてください。`,
    );
  },
});
