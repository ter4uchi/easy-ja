import { decodeEscapes } from '../text/escape.js';
import { SegmentBuilder, type Segment } from '../text/segment.js';
import { commentSegments, type RawComment } from './comments.js';
import type { ExtractOptions } from './types.js';

interface StringSpec {
  open: string;
  close: string;
  /** バックスラッシュのエスケープを解くか */
  escapes: boolean;
  /** 改行をまたげるか */
  multiline: boolean;
}

export interface LexerSpec {
  lineComments: string[];
  blockComments: [open: string, close: string][];
  strings: StringSpec[];
}

const dq: StringSpec = { open: '"', close: '"', escapes: true, multiline: false };
const sq: StringSpec = { open: "'", close: "'", escapes: true, multiline: false };
const sqRaw: StringSpec = { open: "'", close: "'", escapes: false, multiline: true };
const backtick: StringSpec = { open: '`', close: '`', escapes: true, multiline: true };
const backtickRaw: StringSpec = { open: '`', close: '`', escapes: false, multiline: true };
const tripleDq: StringSpec = { open: '"""', close: '"""', escapes: true, multiline: true };
const tripleSq: StringSpec = { open: "'''", close: "'''", escapes: true, multiline: true };

const C_COMMENTS = { lineComments: ['//'], blockComments: [['/*', '*/']] as [string, string][] };

export const LEXERS = {
  c: { ...C_COMMENTS, strings: [dq, sq] },
  go: { ...C_COMMENTS, strings: [dq, sq, backtickRaw] },
  kotlin: { ...C_COMMENTS, strings: [tripleDq, dq, sq] },
  dart: { ...C_COMMENTS, strings: [tripleDq, tripleSq, dq, sq] },
  // Rust の ' はライフタイムにも使うので文字列として扱わない
  rust: { ...C_COMMENTS, strings: [dq] },
  php: { lineComments: ['//', '#'], blockComments: [['/*', '*/']], strings: [dq, sq] },
  javascript: { ...C_COMMENTS, strings: [dq, sq, backtick] },
  python: { lineComments: ['#'], blockComments: [], strings: [tripleDq, tripleSq, dq, sq] },
  hash: { lineComments: ['#'], blockComments: [], strings: [dq, sq] },
  shell: { lineComments: ['#'], blockComments: [], strings: [dq, sqRaw] },
  elixir: { lineComments: ['#'], blockComments: [], strings: [tripleDq, dq, sq] },
  sql: { lineComments: ['--'], blockComments: [['/*', '*/']], strings: [sq, dq] },
  lua: { lineComments: ['--'], blockComments: [['--[[', ']]']], strings: [dq, sq] },
  json: { ...C_COMMENTS, strings: [dq, sq] },
  po: { lineComments: ['#'], blockComments: [], strings: [dq] },
} satisfies Record<string, LexerSpec>;

export type LexerName = keyof typeof LEXERS;

export interface LexResult {
  strings: { contentStart: number; contentEnd: number; escapes: boolean }[];
  comments: RawComment[];
}

export function lex(source: string, spec: LexerSpec): LexResult {
  const strings: LexResult['strings'] = [];
  const comments: RawComment[] = [];
  // 長い記号から先に試す（""" を " より先に）
  const blockComments = [...spec.blockComments].sort((a, b) => b[0].length - a[0].length);
  const stringSpecs = [...spec.strings].sort((a, b) => b.open.length - a.open.length);
  const n = source.length;
  let i = 0;

  outer: while (i < n) {
    for (const [open, close] of blockComments) {
      if (!source.startsWith(open, i)) continue;
      const closeAt = source.indexOf(close, i + open.length);
      const valueEnd = closeAt === -1 ? n : closeAt;
      const end = closeAt === -1 ? n : closeAt + close.length;
      comments.push({ block: true, start: i, end, valueStart: i + open.length, valueEnd });
      i = end;
      continue outer;
    }
    for (const marker of spec.lineComments) {
      if (!source.startsWith(marker, i)) continue;
      const newline = source.indexOf('\n', i);
      const end = newline === -1 ? n : newline;
      comments.push({ block: false, start: i, end, valueStart: i + marker.length, valueEnd: end });
      i = end;
      continue outer;
    }
    for (const s of stringSpecs) {
      if (!source.startsWith(s.open, i)) continue;
      const contentStart = i + s.open.length;
      let j = contentStart;
      while (j < n && !source.startsWith(s.close, j)) {
        if (s.escapes && source[j] === '\\') j++;
        else if (!s.multiline && source[j] === '\n') break;
        j++;
      }
      const contentEnd = Math.min(j, n);
      strings.push({ contentStart, contentEnd, escapes: s.escapes });
      i = source.startsWith(s.close, j) ? j + s.close.length : j;
      continue outer;
    }
    i++;
  }
  return { strings, comments };
}

/** 文字列リテラル（とコメント）からセグメントを取り出す */
export function extractWithLexer(
  source: string,
  spec: LexerSpec,
  options: ExtractOptions & { baseOffset?: number },
): Segment[] {
  const base = options.baseOffset ?? 0;
  const { strings, comments } = lex(source, spec);
  const segments: Segment[] = [];
  for (const s of strings) {
    const raw = source.slice(s.contentStart, s.contentEnd);
    const builder = new SegmentBuilder('string', false);
    if (s.escapes) {
      const d = decodeEscapes(raw, base + s.contentStart);
      builder.addMapped(d.text, d.offsets, d.ends);
    } else {
      builder.add(raw, base + s.contentStart);
    }
    builder.flush(segments);
  }
  if (options.comments) segments.push(...commentSegments(source, comments, base));
  return segments;
}
