import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { maskAllowed, resolveConfig, type ResolvedConfig } from './config.js';
import { createSuppressor } from './directives.js';
import { extract } from './extractors/index.js';
import { findFiles } from './files.js';
import type { RuleReport, Severity } from './rules/index.js';
import { splitSentences, type Sentence } from './text/sentence.js';

export interface Issue {
  ruleId: string;
  severity: Severity;
  message: string;
  /** 1 から数える */
  line: number;
  /** 1 から数える（UTF-16 単位） */
  column: number;
  endLine: number;
  endColumn: number;
  /** 言いかえの例 */
  suggestion?: string;
}

export interface LintResult {
  filePath: string;
  issues: Issue[];
  errorCount: number;
  warningCount: number;
}

export interface LintTextOptions {
  /** 拡張子で抽出方法を決める。省くとプレーンテキストとして調べる */
  filePath?: string;
  config?: ResolvedConfig;
}

/** 大きすぎるファイル（ビルド成果物など）は調べない */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export function lintText(source: string, options: LintTextOptions = {}): LintResult {
  const config = options.config ?? resolveConfig();
  const filePath = options.filePath ?? '<text>';
  const lineStarts = computeLineStarts(source);
  const segments = extract(source, options.filePath ?? 'text.txt', { comments: config.comments });
  const isSuppressed = createSuppressor(source);

  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const sentence of splitSentences(segment)) {
      const masked = maskAllowed(sentence.compact, config);
      const isRuby = (index: number) => {
        const at = sentence.start + (sentence.compactIndex[index] ?? -1);
        return segment.ruby?.some(([start, end]) => at >= start && at < end) ?? false;
      };
      for (const { rule, severity, options: ruleOptions } of config.rules) {
        for (const report of rule.check({ sentence, masked, options: ruleOptions, isRuby })) {
          const issue = toIssue(sentence, report, rule.id, severity, lineStarts);
          if (isSuppressed(issue.line, issue.ruleId)) continue;
          const key = `${issue.ruleId}:${issue.line}:${issue.column}:${issue.endLine}:${issue.endColumn}:${issue.message}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push(issue);
        }
      }
    }
  }

  issues.sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return { filePath, issues, errorCount, warningCount: issues.length - errorCount };
}

export interface LintFilesOptions {
  cwd?: string;
  config?: ResolvedConfig;
}

/** ファイル・ディレクトリ・glob を調べる。patterns が空なら設定の include を使う */
export async function lintFiles(patterns: string[], options: LintFilesOptions = {}): Promise<LintResult[]> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? resolveConfig();
  const files = await findFiles(patterns.length ? patterns : config.include, { cwd, ignore: config.ignore });

  const results: LintResult[] = [];
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const path = resolve(cwd, file);
      if ((await stat(path)).size > MAX_FILE_SIZE) continue;
      const source = await readFile(path, 'utf8');
      if (source.includes('\u0000')) continue;
      results.push(lintText(source, { filePath: file, config }));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return results.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function toIssue(
  sentence: Sentence,
  report: RuleReport,
  ruleId: string,
  severity: Severity,
  lineStarts: number[],
): Issue {
  const sourceOffset = (compactPos: number) => {
    const textIndex = sentence.compactIndex[Math.min(compactPos, sentence.compactIndex.length - 1)] ?? 0;
    return sentence.segment.offsets[sentence.start + textIndex] ?? 0;
  };
  const start = sourceOffset(report.index);
  const end = sourceOffset(report.index + Math.max(report.length, 1) - 1) + 1;
  const [line, column] = position(start, lineStarts);
  const [endLine, endColumn] = position(end, lineStarts);
  const issue: Issue = { ruleId, severity, message: report.message, line, column, endLine, endColumn };
  if (report.suggestion) issue.suggestion = report.suggestion;
  return issue;
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return starts;
}

function position(offset: number, lineStarts: number[]): [line: number, column: number] {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo + 1, offset - lineStarts[lo]! + 1];
}
