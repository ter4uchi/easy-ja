import type { Sentence } from '../text/sentence.js';

export type Severity = 'error' | 'warning';
export type SeveritySetting = Severity | 'off';

export interface RuleContext<O> {
  sentence: Sentence;
  /** sentence.compact の常とう語（許可語）の部分を代替文字に置き換えたもの。長さは compact と同じ */
  masked: string;
  options: O;
  /** compact 上のその文字に <ruby> でルビがふられているか */
  isRuby(index: number): boolean;
}

export interface RuleReport {
  /** sentence.compact 上の位置 */
  index: number;
  length: number;
  message: string;
  /** 言いかえの例 */
  suggestion?: string;
}

export interface Rule<O extends object = object> {
  id: string;
  /** ルールの短い説明 */
  description: string;
  /** 根拠にしたガイドラインの記述 */
  guideline: string;
  defaultSeverity: SeveritySetting;
  defaultOptions: O;
  check(context: RuleContext<O>): RuleReport[];
}

export function defineRule<O extends object>(rule: Rule<O>): Rule<O> {
  return rule;
}

/** 文全体を指す報告 */
export function wholeSentence(context: RuleContext<unknown>, message: string): RuleReport {
  return { index: 0, length: context.sentence.compact.length, message };
}

/** 文の一部を引用するときに長すぎないよう切る */
export function excerpt(text: string, max = 20): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max).join('') + '…' : text;
}
