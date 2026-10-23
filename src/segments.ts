import { resolveConfig, type ResolvedConfig } from './config.js';
import { extract } from './extractors/index.js';
import { mapSourceFiles, type ReadErrorHandler } from './files.js';
import { OBJ } from './text/chars.js';
import { computeLineStarts, position } from './text/position.js';
import type { SegmentKind } from './text/segment.js';

/** 実行時に値が入る部分（`${name}` や `{count}` など）や、コード・URL など文章でない部分の表し方 */
export const PLACEHOLDER_MARK = '{…}';

export interface SegmentEntry {
  kind: SegmentKind;
  /** 前後の空白を除いた文字列。実行時に値が入る部分や、コード・URL など文章でない部分は {…} にしてある */
  text: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface FileSegments {
  filePath: string;
  segments: SegmentEntry[];
}

/**
 * ソースから日本語の文字列を取り出し、位置つきで返す。チェックはしない。
 * AI エージェントなどが、画面に出る文言だけを読むために使う。
 */
export function listSegments(
  source: string,
  options: { filePath?: string; config?: ResolvedConfig } = {},
): FileSegments {
  const config = options.config ?? resolveConfig();
  const lineStarts = computeLineStarts(source);
  const segments = extract(source, options.filePath ?? 'text.txt', { comments: config.comments }).map(
    (segment): SegmentEntry => {
      const first = segment.text.search(/\S/);
      const last = segment.text.trimEnd().length - 1;
      const [line, column] = position(segment.offsets[first]!, lineStarts);
      const [endLine, endColumn] = position(segment.ends[last]!, lineStarts);
      const text = segment.text.slice(first, last + 1).replaceAll(OBJ, PLACEHOLDER_MARK);
      return { kind: segment.kind, text, line, column, endLine, endColumn };
    },
  );
  segments.sort((a, b) => a.line - b.line || a.column - b.column);
  return { filePath: options.filePath ?? '<text>', segments };
}

export async function listFileSegments(
  patterns: string[],
  options: { cwd?: string; config?: ResolvedConfig; onReadError?: ReadErrorHandler } = {},
): Promise<FileSegments[]> {
  const config = options.config ?? resolveConfig();
  const results = await mapSourceFiles(patterns.length ? patterns : config.include, {
    cwd: options.cwd ?? process.cwd(),
    ignore: config.ignore,
    map: (source, filePath) => listSegments(source, { filePath, config }),
    onReadError: options.onReadError,
  });
  return results.filter((r) => r.segments.length > 0);
}
