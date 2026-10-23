import { DIFFICULT_WORDS } from '../data/difficult-words.js';
import { createMatcher, toReports, type DictionaryOptions } from './dictionary.js';
import { defineRule } from './types.js';

const match = createMatcher(DIFFICULT_WORDS);

// 「施設従事者等による」の「等」。「平等」「高等」などの熟語は除く
const NADO = /(?<=\p{Script=Han})(?<![平均対同高上初中劣優特一二三何彼])等(?=[のにはがをでもと、。）)]|$)/gu;

export default defineRule<DictionaryOptions>({
  id: 'difficult-word',
  description: '難しいことばを使っていないか',
  guideline: 'p.2「難しいことばは使わない」',
  defaultSeverity: 'warning',
  defaultOptions: { words: {}, exclude: [] },
  check({ masked, options }) {
    const reports = toReports(
      match(masked, options),
      (word, suggestion) => `「${word}」は難しいことばです。「${suggestion}」のように言いかえてください。`,
    );
    if (!options.exclude.includes('等')) {
      for (const m of masked.matchAll(NADO)) {
        reports.push({
          index: m.index,
          length: 1,
          message: '「等」は難しいことばです。「など」と書いてください。',
          suggestion: 'など',
        });
      }
    }
    return reports;
  },
});
