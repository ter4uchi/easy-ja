import { defineRule } from './types.js';

// 文のはじめの代名詞（前の文の内容を指すもの）。「このページ」のように目の前のものを指す連体詞は対象外
const LEADING = /^[\p{P}\p{S}\d０-９①-⑳]*((?:これ|それ|あれ|こちら|そちら|あちら)(?:は|が|を|に|で|と|も|の|から|まで))/u;
// 接続詞や時を表すことばとして使われるもの
const CONJUNCTIONS = new Set(['これから', 'これまで', 'それから', 'それで', 'それに', 'それと', 'それまで']);

export default defineRule({
  id: 'demonstrative',
  description: '文のはじめに、前の文を指す指示語を使っていないか',
  guideline: 'p.3「指示語を多用せず、あえて二度書く」',
  defaultSeverity: 'warning',
  defaultOptions: {},
  check({ masked }) {
    const m = LEADING.exec(masked);
    if (!m || CONJUNCTIONS.has(m[1]!)) return [];
    const word = m[1]!;
    return [
      {
        index: m[0].length - word.length,
        length: word.length,
        message: `指示語「${word}」が何を指すかわかりにくいです。指しているものを、もう一度書いてください。`,
      },
    ];
  },
});
