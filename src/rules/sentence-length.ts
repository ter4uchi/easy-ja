import { defineRule, excerpt, wholeSentence } from './types.js';

export default defineRule({
  id: 'sentence-length',
  description: '一文が長すぎないか（空白を除いた文字数）',
  guideline: 'p.4「一文は 30 字以内を目安にする」',
  defaultSeverity: 'error',
  defaultOptions: { max: 30 },
  check(context) {
    const length = [...context.sentence.compact].length;
    if (length <= context.options.max) return [];
    return [
      wholeSentence(
        context,
        `一文が${length}文字あります（目安は${context.options.max}文字以内）。文を分けてください：「${excerpt(context.sentence.compact)}」`,
      ),
    ];
  },
});
