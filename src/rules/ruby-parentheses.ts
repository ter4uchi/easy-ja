import { katakanaToHiragana } from '../text/chars.js';
import { defineRule, type RuleReport } from './types.js';

// 「図書館（としょかん）」「メールアドレス（めーるあどれす）」
const RE = /(\p{Script=Han}+|[\p{Script=Katakana}ー]+)[（(]([\p{Script=Hiragana}ー]+)[）)]/gu;

export default defineRule({
  id: 'ruby-parentheses',
  description: '読みがなをカッコ書きにしていないか',
  guideline: 'p.6「ルビは漢字の上部に半分程度のポイントで記述する。該当する漢字の後にカッコ書きで表記しない」',
  defaultSeverity: 'error',
  defaultOptions: {},
  check({ sentence }) {
    const reports: RuleReport[] = [];
    for (const m of sentence.compact.matchAll(RE)) {
      const base = m[1]!;
      // カタカナのあとのひらがなは、読みと同じときだけルビとみなす（「ダイバーシティ（たようせい）」のような説明は対象外）
      if (!/\p{Script=Han}/u.test(base) && katakanaToHiragana(base) !== m[2]) continue;
      reports.push({
        index: m.index,
        length: m[0].length,
        message: `読みがなをカッコ書きにしないでください：「${m[0]}」。ルビは文字の上に小さく書きます（HTML では <ruby> を使います）。`,
      });
    }
    return reports;
  },
});
