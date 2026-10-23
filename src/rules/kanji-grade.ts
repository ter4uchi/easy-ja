import { kanjiGrade } from '../data/kanji-grades.js';
import { defineRule } from './types.js';

// 漢数字の〇と繰り返し記号は学年の表にないが、別のルールで扱う
const IGNORED = new Set(['々', '〇', '〆']);

export default defineRule({
  id: 'kanji-grade',
  description: '小学校の低学年で習わない漢字を使っていないか',
  guideline: 'p.2「常とう語を除いて小学校 2 ～ 3 年生までの漢字を使い、漢字にはルビをふる」',
  defaultSeverity: 'warning',
  defaultOptions: { maxGrade: 3 },
  check({ masked, options, isRuby }) {
    const reports = [];
    for (const m of masked.matchAll(/\p{Script=Han}+/gu)) {
      const hard = new Set<string>();
      // ルビがふってある漢字はよい（ガイドラインの推奨どおり）
      [...m[0]].forEach((ch, i) => {
        if (IGNORED.has(ch) || isRuby(m.index + i)) return;
        const grade = kanjiGrade(ch);
        if (grade === undefined || grade > options.maxGrade) hard.add(ch);
      });
      if (hard.size === 0) continue;
      const list = [...hard]
        .map((ch) => {
          const grade = kanjiGrade(ch);
          return grade ? `${ch}＝${grade}年` : `${ch}＝中学以上`;
        })
        .join('、');
      reports.push({
        index: m.index,
        length: m[0].length,
        message: `「${m[0]}」に小学${options.maxGrade}年生までに習わない漢字があります（${list}）。ひらがなにするか、ルビをふってください。`,
      });
    }
    return reports;
  },
});
