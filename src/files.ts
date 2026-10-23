import { stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { convertPathToPattern, glob, isDynamicPattern } from 'tinyglobby';
import { SUPPORTED_EXTENSIONS } from './extractors/index.js';

export const DEFAULT_IGNORE: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/vendor/**',
  '**/*.min.*',
  '**/*.map',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
];

export class FileNotFoundError extends Error {
  override name = 'FileNotFoundError';
}

/**
 * パターンに合うファイルを cwd からの相対パスで返す。
 * ファイルを直接指定したときは拡張子や ignore に関係なく調べる。
 */
export async function findFiles(
  patterns: readonly string[],
  options: { cwd: string; ignore?: readonly string[] },
): Promise<string[]> {
  const files = new Set<string>();
  const globs: string[] = [];
  const extensions = `{${SUPPORTED_EXTENSIONS.join(',')}}`;

  for (const pattern of patterns) {
    const absolute = resolve(options.cwd, pattern);
    const info = await stat(absolute).catch(() => null);
    const rel = toPosix(relative(options.cwd, absolute));
    if (info?.isFile()) {
      files.add(rel);
    } else if (info?.isDirectory()) {
      globs.push(rel ? `${convertPathToPattern(rel)}/**/*.${extensions}` : `**/*.${extensions}`);
    } else if (isDynamicPattern(pattern)) {
      globs.push(pattern);
    } else {
      throw new FileNotFoundError(`ファイルが見つかりません: ${pattern}`);
    }
  }

  if (globs.length) {
    const found = await glob(globs, {
      cwd: options.cwd,
      ignore: [...DEFAULT_IGNORE, ...(options.ignore ?? [])],
      onlyFiles: true,
      expandDirectories: false,
    });
    for (const file of found) files.add(toPosix(file));
  }
  return [...files].sort();
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}
