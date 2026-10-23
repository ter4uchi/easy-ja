import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { COMMON_WORDS } from './data/common-words.js';
import { ruleMap, rules, type Rule, type Severity, type SeveritySetting } from './rules/index.js';
import { OBJ, escapeRegExp } from './text/chars.js';

export type RuleSetting = SeveritySetting | [SeveritySetting] | [SeveritySetting, Record<string, unknown>];

/** 設定ファイル（.easyjarc.json）の形 */
export interface Config {
  /** ルールごとの重要度とオプション */
  rules?: Record<string, RuleSetting>;
  /** 常とう語など、そのまま使ってよいことば。漢字や難しいことばのチェックから外す */
  allow?: string[];
  /** パスを指定しなかったときに調べるファイル（glob） */
  include?: string[];
  /** 調べないファイル（glob） */
  ignore?: string[];
  /** コメントも調べるか */
  comments?: boolean;
}

export interface ResolvedRule {
  rule: Rule;
  severity: Severity;
  options: object;
}

export interface ResolvedConfig {
  rules: ResolvedRule[];
  allow: string[];
  /** allow のことばを代替文字に置き換えるための正規表現 */
  allowPattern: RegExp | null;
  include: string[];
  ignore: string[];
  comments: boolean;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export const CONFIG_FILES = ['.easyjarc.json', 'easy-ja.config.json'] as const;
const SEVERITIES = new Set<string>(['error', 'warning', 'off']);

/** 設定を検証し、既定値とまとめる */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const settings = config.rules ?? {};
  for (const id of Object.keys(settings)) {
    if (!ruleMap.has(id)) throw new ConfigError(`不明なルールです: ${id}`);
  }

  const resolved: ResolvedRule[] = [];
  for (const rule of rules) {
    const setting = settings[rule.id];
    const [severity, options = {}] = Array.isArray(setting) ? setting : [setting ?? rule.defaultSeverity];
    if (!SEVERITIES.has(severity)) {
      throw new ConfigError(`${rule.id} の重要度は error / warning / off のどれかにしてください: ${String(severity)}`);
    }
    if (severity === 'off') continue;
    resolved.push({ rule, severity, options: mergeOptions(rule, options) });
  }

  const allow = [...new Set([...COMMON_WORDS, ...(config.allow ?? [])])].filter(Boolean);
  const allowPattern = allow.length
    ? new RegExp(
        allow
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join('|'),
        'g',
      )
    : null;

  return {
    rules: resolved,
    allow,
    allowPattern,
    include: config.include ?? ['.'],
    ignore: config.ignore ?? [],
    comments: config.comments ?? false,
  };
}

function mergeOptions(rule: Rule, options: Record<string, unknown>): object {
  const defaults = rule.defaultOptions as Record<string, unknown>;
  for (const [key, value] of Object.entries(options)) {
    if (!(key in defaults)) throw new ConfigError(`${rule.id} に「${key}」というオプションはありません`);
    const expected = kindOf(defaults[key]);
    if (kindOf(value) !== expected) {
      throw new ConfigError(`${rule.id} の「${key}」は ${expected} で指定してください`);
    }
  }
  return { ...defaults, ...options };
}

function kindOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/** 文の中の許可語を代替文字に置き換える。長さは変わらない */
export function maskAllowed(text: string, config: ResolvedConfig): string {
  return config.allowPattern ? text.replace(config.allowPattern, (m) => OBJ.repeat(m.length)) : text;
}

/** cwd から上のディレクトリへ向かって設定ファイルを探す */
export async function findConfigFile(cwd: string): Promise<string | null> {
  let dir = resolve(cwd);
  for (;;) {
    for (const name of CONFIG_FILES) {
      const path = join(dir, name);
      if (await readJson(path).then(() => true, () => false)) return path;
    }
    const pkg = await readJson(join(dir, 'package.json')).catch(() => null);
    if (pkg && typeof pkg === 'object' && 'easyJa' in pkg) return join(dir, 'package.json');
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 設定ファイルを読む。path を省くと cwd から探し、見つからなければ空の設定を返す */
export async function loadConfig(
  path?: string,
  cwd: string = process.cwd(),
): Promise<{ config: Config; path: string | null }> {
  const found = path ? resolve(cwd, path) : await findConfigFile(cwd);
  if (!found) return { config: {}, path: null };
  let json: unknown;
  try {
    json = await readJson(found);
  } catch (error) {
    throw new ConfigError(`設定ファイルを読めません: ${found}\n${(error as Error).message}`);
  }
  const config = found.endsWith('package.json') ? (json as { easyJa?: unknown }).easyJa : json;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new ConfigError(`設定ファイルの中身はオブジェクトにしてください: ${found}`);
  }
  return { config: config as Config, path: found };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** --init で書き出す設定。すべてのルールを既定値で並べる */
export function initialConfig(): Config {
  return {
    rules: Object.fromEntries(
      rules.map((rule): [string, RuleSetting] => [
        rule.id,
        Object.keys(rule.defaultOptions).length
          ? [rule.defaultSeverity, rule.defaultOptions as Record<string, unknown>]
          : rule.defaultSeverity,
      ]),
    ),
    allow: [],
    ignore: [],
    comments: false,
  };
}
