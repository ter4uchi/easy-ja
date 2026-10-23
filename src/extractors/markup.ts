import { Parser } from 'htmlparser2';
import { SegmentBuilder, rawSegment, type Segment } from '../text/segment.js';
import { extractJavaScript, type ScriptLanguage } from './javascript.js';
import { LEXERS, extractWithLexer } from './lexer.js';
import type { ExtractOptions } from './types.js';

export type MarkupDialect = 'html' | 'vue' | 'svelte' | 'xml';

const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'label',
  'mark', 'q', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
  // Vue・Svelte の制御用の要素
  'template', 'slot', 'transition',
]);
const SKIP_ELEMENTS = new Set(['rt', 'rp', 'style']);

export function extractMarkup(source: string, options: ExtractOptions & { dialect: MarkupDialect }): Segment[] {
  const { dialect } = options;
  const segments: Segment[] = [];
  const builder = new SegmentBuilder('markup-text', true);
  const skipStack: string[] = [];
  const rubyStarts: number[] = [];
  let script: { start: number; language: ScriptLanguage | 'json' | null } | null = null;

  // 式の中の文字列だけを取り出す（Vue の {{ }} や :title="..." など）
  const scanExpression = (start: number, end: number) => {
    segments.push(
      ...extractWithLexer(source.slice(start, end), LEXERS.javascript, { comments: false, baseOffset: start }),
    );
  };

  const addText = (start: number, end: number) => {
    const text = source.slice(start, end);
    const mustache = dialect === 'vue' ? /\{\{([\s\S]*?)\}\}/g : dialect === 'svelte' ? /\{([^{}]*)\}/g : null;
    if (!mustache) {
      builder.add(text, start);
      return;
    }
    let last = 0;
    for (const m of text.matchAll(mustache)) {
      builder.add(text.slice(last, m.index), start + last);
      // Svelte の {#if} {/if} {:else} は文字として数えない
      if (!(dialect === 'svelte' && /^[#/:]/.test(m[1]!))) builder.placeholder(start + m.index);
      scanExpression(start + m.index, start + m.index + m[0].length);
      last = m.index + m[0].length;
    }
    builder.add(text.slice(last), start + last);
  };

  const parser = new Parser(
    {
      onattribute(name, value) {
        if (skipStack.length > 0 || !value) return;
        const valueStart = attributeValueStart(source, parser.startIndex + name.length);
        if (valueStart === -1) return;
        const isBound =
          (dialect === 'vue' && /^(?::|@|#|v-)/.test(name)) || (dialect === 'svelte' && value.startsWith('{'));
        if (isBound) scanExpression(valueStart, valueStart + value.length);
        else {
          const segment = rawSegment('attribute', value, valueStart);
          if (segment) segments.push(segment);
        }
      },
      onopentag(name, attributes) {
        const tag = dialect === 'xml' ? name : name.toLowerCase();
        if (skipStack.length > 0 || SKIP_ELEMENTS.has(tag)) {
          skipStack.push(tag);
          return;
        }
        if (tag === 'script') {
          script = { start: parser.endIndex + 1, language: scriptLanguage(attributes) };
          return;
        }
        if (tag === 'ruby') rubyStarts.push(builder.length);
        if (!INLINE_ELEMENTS.has(tag)) builder.flush(segments);
      },
      ontext() {
        if (skipStack.length > 0 || script) return;
        addText(parser.startIndex, parser.endIndex + 1);
      },
      oncomment() {
        if (!options.comments || skipStack.length > 0) return;
        // <!-- と --> を除く
        const segment = rawSegment(
          'comment',
          source.slice(parser.startIndex + 4, parser.endIndex - 2),
          parser.startIndex + 4,
          true,
        );
        if (segment) segments.push(segment);
      },
      onclosetag(name) {
        const tag = dialect === 'xml' ? name : name.toLowerCase();
        if (skipStack.length > 0) {
          if (skipStack.at(-1) === tag) skipStack.pop();
          return;
        }
        if (tag === 'script' && script) {
          segments.push(...extractScript(source, script.start, parser.startIndex, script.language, options.comments));
          script = null;
          return;
        }
        if (tag === 'ruby' && rubyStarts.length) builder.markRuby(rubyStarts.pop()!);
        if (!INLINE_ELEMENTS.has(tag)) builder.flush(segments);
      },
    },
    {
      xmlMode: dialect === 'xml',
      recognizeSelfClosing: true,
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      decodeEntities: false,
    },
  );
  parser.write(source);
  parser.end();
  builder.flush(segments);
  return segments;
}

function attributeValueStart(source: string, from: number): number {
  const m = /^\s*=\s*(["']?)/.exec(source.slice(from, from + 64));
  return m ? from + m[0].length : -1;
}

function scriptLanguage(attributes: Record<string, string>): ScriptLanguage | 'json' | null {
  const lang = attributes.lang?.toLowerCase();
  const type = attributes.type?.toLowerCase() ?? '';
  if (type.includes('json')) return 'json';
  if (type && !/javascript|module|babel|jsx|typescript/.test(type)) return null;
  if (lang === 'ts' || lang === 'typescript') return 'ts';
  if (lang === 'tsx') return 'tsx';
  return 'jsx';
}

function extractScript(
  source: string,
  start: number,
  end: number,
  language: ScriptLanguage | 'json' | null,
  comments: boolean,
): Segment[] {
  if (!language) return [];
  const code = source.slice(start, end);
  if (language === 'json') return extractWithLexer(code, LEXERS.json, { comments, baseOffset: start });
  try {
    return extractJavaScript(code, { language, comments, baseOffset: start });
  } catch {
    return extractWithLexer(code, LEXERS.javascript, { comments, baseOffset: start });
  }
}
