import { SegmentBuilder, type Segment } from '../text/segment.js';
import { splitLines } from './lines.js';
import type { ExtractOptions } from './types.js';

// インラインの記法。コードやURLは代替文字にし、リンクは文字の部分だけを残す
const INLINE =
  /(`+)[\s\S]*?\1|!\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\[[^\]]*\]|<https?:[^>]+>|<\/?[A-Za-z][^>]*>|https?:\/\/[^\s)]+|\*\*|__|~~|[*_]/g;

function addInline(builder: SegmentBuilder, text: string, offset: number): void {
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    builder.add(text.slice(last, m.index), offset + last);
    const label = m[2] ?? m[3] ?? m[4];
    if (label !== undefined) {
      // ![alt](…) は2文字、[text](…) は1文字の記号のあとに文字がある
      builder.add(label, offset + m.index + (m[2] !== undefined ? 2 : 1));
    } else if (m[1] || m[0].startsWith('<http') || m[0].startsWith('http')) {
      builder.placeholder(offset + m.index, offset + m.index + m[0].length);
    }
    last = m.index + m[0].length;
  }
  builder.add(text.slice(last), offset + last);
}

export function extractMarkdown(source: string, options: ExtractOptions): Segment[] {
  const segments: Segment[] = [];
  const paragraph = new SegmentBuilder('text', true);
  const flush = () => paragraph.flush(segments);
  const single = (text: string, offset: number) => {
    flush();
    addInline(paragraph, text, offset);
    flush();
  };

  const lines = splitLines(source);
  let fence: string | null = null;
  let inHtmlComment = false;
  let index = 0;

  // フロントマター
  if (lines[0]?.text === '---') {
    const close = lines.findIndex((l, i) => i > 0 && (l.text === '---' || l.text === '...'));
    if (close > 0) index = close + 1;
  }

  for (; index < lines.length; index++) {
    const { text: line, start } = lines[index]!;
    let m: RegExpExecArray | null;

    if (fence) {
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (inHtmlComment) {
      if (line.includes('-->')) inHtmlComment = false;
      continue;
    }
    if ((m = /^\s*(`{3,}|~{3,})/.exec(line))) {
      flush();
      fence = m[1]!;
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      if (options.comments) {
        const body = line.replace(/^\s*<!--/, '').replace(/-->.*$/, '');
        single(body, start + line.indexOf('<!--') + 4);
      }
      if (!line.includes('-->')) inHtmlComment = true;
      continue;
    }
    // MDX の import / export
    if (/^(?:import|export)\s/.test(line) || /^\s*$/.test(line)) {
      flush();
      continue;
    }

    // 引用記号を取り除く
    const quote = /^\s*(?:>\s?)*/.exec(line)![0];
    const content = line.slice(quote.length);
    const contentStart = start + quote.length;
    if (quote.includes('>') && /^\s*$/.test(content)) {
      flush();
      continue;
    }

    if ((m = /^(\s{0,3}#{1,6}\s+)(.*?)(?:\s+#+)?\s*$/.exec(content))) {
      single(m[2]!, contentStart + m[1]!.length);
    } else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(content) || /^\s{0,3}=+\s*$/.test(content)) {
      // 区切り線・見出しの下線
      flush();
    } else if (/^\s*\|/.test(content)) {
      // 表は1つのセルを1つの文として扱う
      flush();
      if (/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(content)) continue;
      let cellStart = 0;
      for (const cell of content.split('|')) {
        single(cell, contentStart + cellStart);
        cellStart += cell.length + 1;
      }
    } else if ((m = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/.exec(content))) {
      flush();
      addInline(paragraph, content.slice(m[1]!.length), contentStart + m[1]!.length);
    } else if (/^( {4,}|\t)/.test(content) && paragraph.isEmpty) {
      // インデントによるコードブロック
      continue;
    } else {
      if (!paragraph.isEmpty) paragraph.add('\n', contentStart - 1);
      addInline(paragraph, content, contentStart);
    }
  }
  flush();
  return segments;
}
