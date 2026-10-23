import compoundSentence from './compound-sentence.js';
import demonstrative from './demonstrative.js';
import difficultWord from './difficult-word.js';
import doubleNegative from './double-negative.js';
import indirectExpression from './indirect-expression.js';
import kanjiGrade from './kanji-grade.js';
import kanjiNumeral from './kanji-numeral.js';
import kanjiSequence from './kanji-sequence.js';
import loanword from './loanword.js';
import rubyParentheses from './ruby-parentheses.js';
import sentenceLength from './sentence-length.js';
import time24h from './time-24h.js';
import type { Rule } from './types.js';
import wakachigaki from './wakachigaki.js';

/** ガイドラインの章の順に並べたルール */
export const rules: readonly Rule[] = [
  // 文章の書き方 ― 簡単かつ具体的に
  difficultWord,
  kanjiSequence,
  kanjiGrade,
  // 複雑な表現は避ける
  doubleNegative,
  indirectExpression,
  demonstrative,
  // シンプルな構文に
  sentenceLength,
  compoundSentence,
  // 表記上のその他の注意事項
  loanword,
  kanjiNumeral,
  time24h,
  // 文字まわりの配慮
  rubyParentheses,
  wakachigaki,
];

export const ruleMap: ReadonlyMap<string, Rule> = new Map(rules.map((rule) => [rule.id, rule]));

export type { Rule, RuleContext, RuleReport, Severity, SeveritySetting } from './types.js';
