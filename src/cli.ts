import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigError, initialConfig, loadConfig, resolveConfig, type Config } from './config.js';
import { FileNotFoundError } from './files.js';
import { lintFiles, lintText, type LintResult } from './linter.js';
import { formatters } from './reporters/index.js';
import { rules, ruleMap } from './rules/index.js';

export interface CliIO {
  stdout: NodeJS.WritableStream & { isTTY?: boolean };
  stderr: NodeJS.WritableStream;
  stdin: NodeJS.ReadableStream;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const HELP = `使い方: easy-ja [オプション] [ファイル・ディレクトリ・glob ...]

厚生労働省「わかりやすい情報提供に関するガイドライン」に沿って、
ソースコードの文字列・JSX・HTML・Markdown などに書かれた日本語を調べます。
パスを省くと、カレントディレクトリ（設定の include）を調べます。

オプション:
  -c, --config <path>        設定ファイルを指定する（既定: .easyjarc.json を探す）
  -f, --format <name>        出力形式: stylish（既定）, json, github
      --rule <id>=<重要度>    ルールの重要度を変える（error / warning / off）。何度でも指定できる
      --comments             コメントも調べる
      --ignore <glob>        調べないファイル。何度でも指定できる
  -q, --quiet                エラーだけを表示する
      --max-warnings <n>     警告が n 件をこえたら失敗にする
      --stdin                標準入力から読む
      --stdin-filename <名前> 標準入力の内容をどの種類のファイルとして調べるか（例: App.tsx）
      --list-rules           ルールの一覧を表示する
      --init                 設定ファイル .easyjarc.json を作る
      --no-color             色を付けない
  -h, --help                 このヘルプを表示する
  -v, --version              バージョンを表示する

終了コード:
  0  問題なし（または警告だけ）
  1  エラーがある、または警告が --max-warnings をこえた
  2  設定や引数のまちがいなどで実行できなかった
`;

class UsageError extends Error {}

export async function main(argv: string[], io: CliIO = defaultIO()): Promise<number> {
  const out = (text: string) => void io.stdout.write(text);
  const err = (text: string) => void io.stderr.write(text);

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      options: {
        config: { type: 'string', short: 'c' },
        format: { type: 'string', short: 'f', default: 'stylish' },
        rule: { type: 'string', multiple: true },
        comments: { type: 'boolean' },
        ignore: { type: 'string', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
        'max-warnings': { type: 'string' },
        stdin: { type: 'boolean' },
        'stdin-filename': { type: 'string' },
        'list-rules': { type: 'boolean' },
        init: { type: 'boolean' },
        color: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });

    if (values.help) {
      out(HELP);
      return 0;
    }
    if (values.version) {
      out(`${readVersion()}\n`);
      return 0;
    }
    if (values['list-rules']) {
      out(listRules());
      return 0;
    }
    if (values.init) return await init(io, out, err);

    const formatter = formatters[values.format];
    if (!formatter) throw new UsageError(`出力形式は ${Object.keys(formatters).join(' / ')} のどれかにしてください: ${values.format}`);
    const maxWarnings = values['max-warnings'] === undefined ? undefined : Number(values['max-warnings']);
    if (maxWarnings !== undefined && !Number.isInteger(maxWarnings)) {
      throw new UsageError(`--max-warnings には整数を指定してください: ${values['max-warnings']}`);
    }

    const { config: fileConfig } = await loadConfig(values.config, io.cwd);
    const config = resolveConfig(applyCliOverrides(fileConfig, values));

    let results: LintResult[];
    if (values.stdin) {
      const source = await readStream(io.stdin);
      const filePath = values['stdin-filename'];
      results = [{ ...lintText(source, { filePath: filePath ?? 'stdin.txt', config }), filePath: filePath ?? '<stdin>' }];
    } else {
      results = await lintFiles(positionals, { cwd: io.cwd, config });
    }

    if (values.quiet) {
      results = results.map((r) => ({ ...r, issues: r.issues.filter((i) => i.severity === 'error'), warningCount: 0 }));
    }

    const color = values.color ?? (io.env.FORCE_COLOR ? io.env.FORCE_COLOR !== '0' : Boolean(io.stdout.isTTY) && !io.env.NO_COLOR);
    out(formatter(results, { color }));

    const errors = results.reduce((n, r) => n + r.errorCount, 0);
    const warnings = results.reduce((n, r) => n + r.warningCount, 0);
    if (errors > 0) return 1;
    if (maxWarnings !== undefined && warnings > maxWarnings) {
      err(`警告が ${warnings} 件あり、--max-warnings ${maxWarnings} をこえました。\n`);
      return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError || error instanceof ConfigError || error instanceof FileNotFoundError) {
      err(`easy-ja: ${error.message}\n`);
      return 2;
    }
    if (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')) {
      err(`easy-ja: ${error.message}\n\n${HELP}`);
      return 2;
    }
    err(`easy-ja: 予期しないエラーが起きました\n${(error as Error).stack ?? String(error)}\n`);
    return 2;
  }
}

function applyCliOverrides(
  config: Config,
  values: { rule?: string[]; comments?: boolean; ignore?: string[] },
): Config {
  const rulesSetting = { ...config.rules };
  for (const spec of values.rule ?? []) {
    const m = /^([\w-]+)=(error|warning|off)$/.exec(spec);
    if (!m) throw new UsageError(`--rule は <ルール>=<error|warning|off> の形で指定してください: ${spec}`);
    const [, id, severity] = m as unknown as [string, string, 'error' | 'warning' | 'off'];
    if (!ruleMap.has(id)) throw new UsageError(`不明なルールです: ${id}`);
    const current = rulesSetting[id];
    rulesSetting[id] = Array.isArray(current) && current[1] ? [severity, current[1]] : severity;
  }
  return {
    ...config,
    rules: rulesSetting,
    comments: values.comments ?? config.comments,
    ignore: [...(config.ignore ?? []), ...(values.ignore ?? [])],
  };
}

function listRules(): string {
  const width = Math.max(...rules.map((r) => r.id.length));
  const lines = rules.map((rule) => {
    const severity = rule.defaultSeverity.padEnd(7);
    return `${rule.id.padEnd(width)}  ${severity}  ${rule.description}\n${' '.repeat(width + 11)}根拠: ${rule.guideline}`;
  });
  return `${lines.join('\n')}\n`;
}

async function init(io: CliIO, out: (s: string) => void, err: (s: string) => void): Promise<number> {
  const path = resolve(io.cwd, '.easyjarc.json');
  try {
    await writeFile(path, JSON.stringify(initialConfig(), null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      err(`easy-ja: ${path} はすでにあります\n`);
      return 2;
    }
    throw error;
  }
  out(`${path} を作りました\n`);
  return 0;
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function defaultIO(): CliIO {
  return { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, cwd: process.cwd(), env: process.env };
}
