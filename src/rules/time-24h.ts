import { toHalfWidthDigits } from '../text/chars.js';
import { defineRule, type RuleReport } from './types.js';

export default defineRule({
  id: 'time-24h',
  description: '時刻を24時間表記で書いていないか',
  guideline: 'p.5「時刻は２４時間表記ではなく、午前・午後などで表記する」',
  defaultSeverity: 'error',
  defaultOptions: {},
  check({ masked }) {
    const reports: RuleReport[] = [];
    // 「13時」「13:30」「１３：３０」。「13時間」は時刻ではないので除く
    const re = /(?<![0-9０-９:：])([0-9０-９]{1,2})(?:時(?!間)([0-9０-９]{1,2}分)?|[:：]([0-9０-９]{2}))/g;
    for (const m of masked.matchAll(re)) {
      const hour = Number(toHalfWidthDigits(m[1]!));
      if (hour < 13 || hour > 24) continue;
      const minute = m[2] ? toHalfWidthDigits(m[2]) : m[3] && m[3] !== '00' ? `${Number(toHalfWidthDigits(m[3]))}分` : '';
      const suggestion = hour === 24 ? `午前0時${minute}` : `午後${hour - 12}時${minute}`;
      reports.push({
        index: m.index,
        length: m[0].length,
        message: `時刻は24時間表記ではなく、午前・午後で書いてください：「${m[0]}」→「${suggestion}」`,
        suggestion,
      });
    }
    return reports;
  },
});
