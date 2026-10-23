import { maskAllowed, resolveConfig, type ResolvedConfig } from './config.js';
import { createSuppressor } from './directives.js';
import { extract } from './extractors/index.js';
import { mapSourceFiles, type ReadErrorHandler } from './files.js';
import type { RuleReport, Severity } from './rules/index.js';
import { computeLineStarts, position } from './text/position.js';
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
  /** 読めなかったファイルを知らせる。指定しなければ黙って飛ばす */
  onReadError?: ReadErrorHandler;
}

/** ファイル・ディレクトリ・glob を調べる。patterns が空なら設定の include を使う */
export async function lintFiles(patterns: string[], options: LintFilesOptions = {}): Promise<LintResult[]> {
  const config = options.config ?? resolveConfig();
  return mapSourceFiles(patterns.length ? patterns : config.include, {
    cwd: options.cwd ?? process.cwd(),
    ignore: config.ignore,
    map: (source, filePath) => lintText(source, { filePath, config }),
    onReadError: options.onReadError,
  });
}

function toIssue(
  sentence: Sentence,
  report: RuleReport,
  ruleId: string,
  severity: Severity,
  lineStarts: number[],
): Issue {
  const { offsets, ends } = sentence.segment;
  /** compact 上の位置 → segment.text 上の位置 */
  const textIndex = (compactPos: number) =>
    sentence.start + (sentence.compactIndex[Math.min(compactPos, sentence.compactIndex.length - 1)] ?? 0);
  const start = offsets[textIndex(report.index)] ?? 0;
  const end = ends[textIndex(report.index + Math.max(report.length, 1) - 1)] ?? start + 1;
  const [line, column] = position(start, lineStarts);
  const [endLine, endColumn] = position(end, lineStarts);
  const issue: Issue = { ruleId, severity, message: report.message, line, column, endLine, endColumn };
  if (report.suggestion) issue.suggestion = report.suggestion;
  return issue;
}

