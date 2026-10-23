import { defineRule } from './types.js';

export default defineRule({
  id: 'kanji-sequence',
  description: '漢字が続きすぎていないか',
  guideline: 'p.2「常とう語を除いて、漢字が４つ以上連なることばや抽象的な概念のことばは避ける」',
  defaultSeverity: 'warning',
  defaultOptions: { max: 3 },
  check({ masked, options }) {
    const reports = [];
    for (const m of masked.matchAll(/\p{Script=Han}+/gu)) {
      if (m[0].length <= options.max) continue;
      reports.push({
        index: m.index,
        length: m[0].length,
        message: `漢字が${m[0].length}文字続いています：「${m[0]}」。ことばを分けるか、ひらがなを使ってください。`,
      });
    }
    return reports;
  },
});
