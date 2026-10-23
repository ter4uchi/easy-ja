import { extname } from 'node:path';
import { collapsePlaceholders, type Segment } from '../text/segment.js';
import { extractJavaScript, type ScriptLanguage } from './javascript.js';
import { LEXERS, extractWithLexer, type LexerName } from './lexer.js';
import { extractMarkdown } from './markdown.js';
import { extractMarkup, type MarkupDialect } from './markup.js';
import { extractPlainText } from './plain.js';
import type { ExtractOptions, Extractor } from './types.js';
import { extractYaml } from './yaml.js';

const SCRIPT: Record<string, ScriptLanguage> = {
  '.js': 'jsx', '.jsx': 'jsx', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx',
};

const MARKUP: Record<string, MarkupDialect> = {
  '.html': 'html', '.htm': 'html', '.xhtml': 'html',
  '.vue': 'vue', '.svelte': 'svelte', '.xml': 'xml',
};

const LEXER_BY_EXT: Record<string, LexerName> = {
  '.c': 'c', '.h': 'c', '.cc': 'c', '.cpp': 'c', '.cxx': 'c', '.hpp': 'c', '.cs': 'c', '.java': 'c',
  '.m': 'c', '.mm': 'c', '.scala': 'c', '.strings': 'c',
  '.go': 'go',
  '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'kotlin', '.groovy': 'kotlin',
  '.dart': 'dart',
  '.rs': 'rust',
  '.php': 'php',
  '.py': 'python', '.pyi': 'python',
  '.rb': 'hash', '.pl': 'hash', '.r': 'hash',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.ex': 'elixir', '.exs': 'elixir',
  '.sql': 'sql',
  '.lua': 'lua',
  '.json': 'json', '.jsonc': 'json', '.json5': 'json', '.arb': 'json',
  '.po': 'po', '.pot': 'po',
};

const OTHERS: Record<string, Extractor> = {
  '.md': extractMarkdown, '.markdown': extractMarkdown, '.mdx': extractMarkdown,
  '.yml': extractYaml, '.yaml': extractYaml,
  '.txt': extractPlainText,
};

/** 調べられる拡張子（ディレクトリを指定したときに探すファイル） */
export const SUPPORTED_EXTENSIONS: readonly string[] = [
  ...Object.keys(SCRIPT),
  ...Object.keys(MARKUP),
  ...Object.keys(LEXER_BY_EXT),
  ...Object.keys(OTHERS),
].map((ext) => ext.slice(1));

/** ファイル名から抽出器を選ぶ。対応していない拡張子なら null */
export function getExtractor(filePath: string): Extractor | null {
  const ext = extname(filePath).toLowerCase();
  const script = SCRIPT[ext];
  if (script) {
    return (source, options) => {
      try {
        return extractJavaScript(source, { ...options, language: script });
      } catch {
        // 構文エラーなどで解析できないときは、文字列とコメントだけを拾う
        return extractWithLexer(source, LEXERS.javascript, options);
      }
    };
  }
  const dialect = MARKUP[ext];
  if (dialect) return (source, options) => extractMarkup(source, { ...options, dialect });
  const lexer = LEXER_BY_EXT[ext];
  if (lexer) return (source, options) => extractWithLexer(source, LEXERS[lexer], options);
  return OTHERS[ext] ?? null;
}

/** ファイルの種類に合わせて日本語を取り出す。`{name}` や `%s` などは1文字の代替文字にまとめる */
export function extract(source: string, filePath: string, options: ExtractOptions): Segment[] {
  return (getExtractor(filePath) ?? extractPlainText)(source, options).map(collapsePlaceholders);
}

export type { ExtractOptions, Extractor } from './types.js';
