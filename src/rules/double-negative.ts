import { defineRule, type RuleReport } from './types.js';

const NEG_END = '(?:ない|ありません|ないです|いない|いません)';

const PATTERNS: readonly RegExp[] = [
  // しないということはない／しないことはない／しないこともない
  new RegExp(`ない(?:という|って)?(?:こと|の)[はも]${NEG_END}`, 'g'),
  // ないわけではない／ないわけにはいかない
  new RegExp(`ない(?:という)?わけ(?:では|じゃ|でも)${NEG_END}`, 'g'),
  /ない(?:という)?わけには(?:いかない|いきません|ゆかない)/g,
  // なくはない／なくもない
  new RegExp(`な(?:く|くて)[はも]${NEG_END}`, 'g'),
  // ないとは限らない／ないとも言えない
  /ない(?:とは|とも)(?:限らない|限りません|かぎらない|かぎりません|言えない|言えません|いえない|いえません)/g,
  // ざるを得ない
  /ざるを(?:得|え)(?:ない|ません)/g,
  // せずにはいられない／しないではいられない
  /(?:ずには|ないでは)(?:いられ|おれ|すま|おか)(?:ない|ません)/g,
  // ないでもない／ないものでもない
  new RegExp(`ない(?:もの)?(?:でも|では)${NEG_END}`, 'g'),
  // 知らない人はいない
  /ない(?:人|者|ひと|もの)は(?:いない|いません|ない|ありません)/g,
];

// 「〜なければならない」も二重否定だが、よく使われるので既定では調べない
const OBLIGATION = /(?:なければ|なくては|ないと|なくちゃ|なきゃ)(?:なら|なり|いけ|だめ|ダメ)(?:ない|ません|です|だ)?/g;

export default defineRule({
  id: 'double-negative',
  description: '二重否定を使っていないか',
  guideline: 'p.3「二重否定は使わない」',
  defaultSeverity: 'error',
  defaultOptions: { obligation: false },
  check({ masked, options }) {
    const reports: RuleReport[] = [];
    const seen = new Set<number>();
    for (const re of PATTERNS) {
      for (const m of masked.matchAll(re)) {
        if (seen.has(m.index)) continue;
        seen.add(m.index);
        reports.push({
          index: m.index,
          length: m[0].length,
          message: `二重否定は使わず、直接的な表現にしてください：「${m[0]}」`,
        });
      }
    }
    if (options.obligation) {
      for (const m of masked.matchAll(OBLIGATION)) {
        reports.push({
          index: m.index,
          length: m[0].length,
          message: `「${m[0]}」は二重否定です。「〜してください」「〜が必要です」などにしてください。`,
        });
      }
    }
    return reports;
  },
});
