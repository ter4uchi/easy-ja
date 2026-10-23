import { hasJapanese } from '../text/chars.js';
import { defineRule, type RuleReport } from './types.js';

// 空白と句読点・カッコで区切った1つのかたまり
const CHUNK = /[^\s、。，．！？!?「」『』（）()]+/g;

export default defineRule({
  id: 'wakachigaki',
  description: '分かち書きをしているか（区切りのない長いかたまりがないか）',
  guideline: 'p.6「意味のある単位で分かち書きにする」',
  defaultSeverity: 'off',
  defaultOptions: { max: 10 },
  check({ sentence, options }) {
    const reports: RuleReport[] = [];
    // 空白を見るので compact ではなく元の文を調べ、位置を compact 上に直す
    const toCompact = new Map(sentence.compactIndex.map((textIndex, i) => [textIndex, i]));
    for (const m of sentence.text.matchAll(CHUNK)) {
      const length = [...m[0]].length;
      if (length <= options.max || !hasJapanese(m[0])) continue;
      reports.push({
        index: toCompact.get(m.index) ?? 0,
        length: m[0].length,
        message: `区切りのない文字が${length}文字続いています：「${m[0]}」。意味のまとまりで空白を入れてください。`,
      });
    }
    return reports;
  },
});
