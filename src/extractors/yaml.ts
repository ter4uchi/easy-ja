import { decodeEscapes } from '../text/escape.js';
import { SegmentBuilder, rawSegment, type Segment } from '../text/segment.js';
import { splitLines } from './lines.js';
import type { ExtractOptions } from './types.js';

// 「key: value」「- value」「- key: value」の value の部分
const ENTRY = /^(\s*)((?:-\s+)*)(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"\-?:,[\]{}][^#]*?|\?)\s*:(?:\s+|$))?/;

/**
 * YAML から値（とコメント）を取り出す。i18n の翻訳ファイルを想定した簡易的な解析で、
 * キーは調べない。
 */
export function extractYaml(source: string, options: ExtractOptions): Segment[] {
  const segments: Segment[] = [];
  let block: { indent: number; builder: SegmentBuilder } | null = null;

  for (const { text: line, start } of splitLines(source)) {
    const indent = /^\s*/.exec(line)![0].length;

    // ブロックスカラー（| や > のあとの行）
    if (block) {
      if (/^\s*$/.test(line)) {
        block.builder.add('\n', start);
        continue;
      }
      if (indent > block.indent) {
        block.builder.add(line.slice(indent), start + indent).add('\n', start + line.length);
        continue;
      }
      block.builder.flush(segments);
      block = null;
    }

    if (/^\s*#/.test(line)) {
      if (options.comments) {
        const at = line.indexOf('#') + 1;
        const segment = rawSegment('comment', line.slice(at), start + at);
        if (segment) segments.push(segment);
      }
      continue;
    }
    if (/^\s*(?:---|\.\.\.)\s*$/.test(line)) continue;

    const entry = ENTRY.exec(line)!;
    let valueStart = entry[0].length;
    let value = line.slice(valueStart);
    if (!value.trim()) continue;

    if (/^[|>][-+0-9]*\s*(?:#.*)?$/.test(value)) {
      // 「- key: |」ならキーの位置、「- |」なら行頭より深い行が中身になる
      const keyIndent = entry[1]!.length + entry[2]!.length;
      const hasKey = entry[0].length > keyIndent;
      // | は改行をそのまま、> は改行を空白として扱う
      block = {
        indent: hasKey ? keyIndent : entry[1]!.length,
        builder: new SegmentBuilder('string', value.startsWith('>')),
      };
      continue;
    }

    const quote = value[0];
    if (quote === '"') {
      const end = findClosingQuote(value);
      const d = decodeEscapes(value.slice(1, end), start + valueStart + 1);
      const out: Segment[] = [];
      new SegmentBuilder('string', false).addMapped(d.text, d.offsets, d.ends).flush(out);
      segments.push(...out);
    } else if (quote === "'") {
      const m = /^'((?:[^']|'')*)'?/.exec(value)!;
      const segment = rawSegment('string', m[1]!, start + valueStart + 1);
      if (segment) segments.push(segment);
    } else {
      // 末尾のコメントを除く
      value = value.replace(/\s+#.*$/, '').trimEnd();
      const leading = /^\s*/.exec(value)![0].length;
      valueStart += leading;
      const segment = rawSegment('string', value.slice(leading), start + valueStart);
      if (segment) segments.push(segment);
    }
  }
  block?.builder.flush(segments);
  return segments;
}

function findClosingQuote(value: string): number {
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '\\') i++;
    else if (value[i] === '"') return i;
  }
  return value.length;
}
