import { hasJapanese } from './chars.js';
import type { Segment } from './segment.js';

export interface Sentence {
  segment: Segment;
  /** segment.text 上の開始位置 */
  start: number;
  text: string;
  /** 空白を取り除いた文。規則はこの文字列を調べる */
  compact: string;
  /** compact[i] に対応する text 上の位置 */
  compactIndex: number[];
}

const TERMINATORS = new Set(['。', '．', '！', '？', '!', '?']);
const CLOSERS = new Set(['」', '』', '）', ')', '】', '〉', '》', '”', '’']);
const SPACE_RE = /\s/;

/** セグメントを文に分ける。日本語を含まない文は捨てる。 */
export function splitSentences(segment: Segment): Sentence[] {
  const t = segment.text;
  const out: Sentence[] = [];
  let start = 0;

  const cut = (end: number, next: number) => {
    const sentence = makeSentence(segment, start, end);
    if (sentence) out.push(sentence);
    start = next;
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (TERMINATORS.has(ch)) {
      let j = i + 1;
      while (j < t.length && (TERMINATORS.has(t[j]!) || CLOSERS.has(t[j]!))) j++;
      cut(j, j);
      i = j - 1;
    } else if (ch === '\n') {
      // flow なテキストでは空行だけを区切りにする
      if (!segment.flow || /^\n[ \t　\r]*\n/.test(t.slice(i))) cut(i, i + 1);
    }
  }
  cut(t.length, t.length);
  return out;
}

function makeSentence(segment: Segment, from: number, to: number): Sentence | null {
  let start = from;
  let end = to;
  while (start < end && SPACE_RE.test(segment.text[start]!)) start++;
  while (end > start && SPACE_RE.test(segment.text[end - 1]!)) end--;
  const text = segment.text.slice(start, end);
  if (!hasJapanese(text)) return null;

  let compact = '';
  const compactIndex: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (SPACE_RE.test(ch)) continue;
    compact += ch;
    compactIndex.push(i);
  }
  return { segment, start, text, compact, compactIndex };
}
