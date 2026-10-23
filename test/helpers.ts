import { resolveConfig, type Config } from '../src/config.js';
import { lintText } from '../src/linter.js';
import { rules } from '../src/rules/index.js';

/** 1つのルールだけを有効にした設定 */
export function only(id: string, options?: Record<string, unknown>, extra: Omit<Config, 'rules'> = {}) {
  return resolveConfig({
    ...extra,
    rules: Object.fromEntries(
      rules.map((r) => [r.id, r.id === id ? (options ? ['error', options] : 'error') : 'off']),
    ),
  });
}

/** 1つのルールで調べ、指摘のメッセージを返す */
export function check(text: string, id: string, options?: Record<string, unknown>, filePath?: string): string[] {
  return lintText(text, { filePath, config: only(id, options) }).issues.map((i) => i.message);
}
