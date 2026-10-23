import { escapeRegExp } from '../text/chars.js';
import type { RuleReport } from './types.js';

export interface DictionaryOptions {
  /** 辞書に追加することば（ことば → 言いかえの例） */
  words: Record<string, string>;
  /** 辞書から外すことば */
  exclude: string[];
}

/** 辞書のことばを探す。結果は options が変わるまで使い回す */
export function createMatcher(base: Readonly<Record<string, string>>) {
  let cacheKey: DictionaryOptions | undefined;
  let cached: { re: RegExp | null; dict: Map<string, string> } | undefined;

  const build = (options: DictionaryOptions) => {
    const dict = new Map(Object.entries({ ...base, ...options.words }));
    for (const word of options.exclude) dict.delete(word);
    const words = [...dict.keys()].sort((a, b) => b.length - a.length);
    const alternatives = words.map((w) => {
      const escaped = escapeRegExp(w);
      // 短いカタカナ語は、長いカタカナ語の一部に一致しないようにする
      return /^[\p{Script=Katakana}ー]{1,3}$/u.test(w)
        ? `(?<![\\p{Script=Katakana}ー])${escaped}(?![\\p{Script=Katakana}ー])`
        : escaped;
    });
    return { re: words.length ? new RegExp(alternatives.join('|'), 'gu') : null, dict };
  };

  return (text: string, options: DictionaryOptions): { index: number; word: string; suggestion: string }[] => {
    if (cacheKey !== options || !cached) {
      cached = build(options);
      cacheKey = options;
    }
    const { re, dict } = cached;
    if (!re) return [];
    return [...text.matchAll(re)].map((m) => ({ index: m.index, word: m[0], suggestion: dict.get(m[0]) ?? '' }));
  };
}

export function toReports(
  matches: { index: number; word: string; suggestion: string }[],
  message: (word: string, suggestion: string) => string,
): RuleReport[] {
  return matches.map(({ index, word, suggestion }) => ({
    index,
    length: word.length,
    message: message(word, suggestion),
    suggestion,
  }));
}
