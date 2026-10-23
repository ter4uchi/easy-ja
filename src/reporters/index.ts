import type { LintResult } from '../linter.js';
import { createColors } from './colors.js';

export interface FormatOptions {
  color: boolean;
}

export type Formatter = (results: readonly LintResult[], options: FormatOptions) => string;

/** ESLint の stylish に近い、人が読むための形式 */
export const stylish: Formatter = (results, options) => {
  const c = createColors(options.color);
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    if (result.issues.length === 0) continue;
    errors += result.errorCount;
    warnings += result.warningCount;
    lines.push(c.underline(result.filePath));
    const width = Math.max(...result.issues.map((i) => `${i.line}:${i.column}`.length));
    for (const issue of result.issues) {
      const pos = `${issue.line}:${issue.column}`.padEnd(width);
      const severity = issue.severity === 'error' ? c.red('error  ') : c.yellow('warning');
      lines.push(`  ${c.gray(pos)}  ${severity}  ${issue.message}  ${c.gray(issue.ruleId)}`);
    }
    lines.push('');
  }

  const total = errors + warnings;
  if (total === 0) {
    lines.push(c.green(`✔ 問題は見つかりませんでした（${results.length} ファイル）`));
  } else {
    const summary = `✖ ${total} 件の問題（エラー ${errors} 件、警告 ${warnings} 件）`;
    lines.push(c.bold(errors > 0 ? c.red(summary) : c.yellow(summary)));
  }
  return lines.join('\n') + '\n';
};

export const json: Formatter = (results) => JSON.stringify(results, null, 2) + '\n';

/** GitHub Actions のワークフローコマンド。プルリクエストの差分に注釈が付く */
export const github: Formatter = (results) => {
  const escapeData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = (s: string) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const lines: string[] = [];
  for (const result of results) {
    for (const issue of result.issues) {
      const command = issue.severity === 'error' ? 'error' : 'warning';
      const props = [
        `file=${escapeProperty(result.filePath)}`,
        `line=${issue.line}`,
        `col=${issue.column}`,
        `endLine=${issue.endLine}`,
        `endColumn=${issue.endColumn}`,
        `title=${escapeProperty(`easy-ja (${issue.ruleId})`)}`,
      ].join(',');
      lines.push(`::${command} ${props}::${escapeData(issue.message)}`);
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
};

export const formatters: Readonly<Record<string, Formatter>> = { stylish, json, github };
