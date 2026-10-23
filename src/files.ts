import { readFile, stat } from 'node:fs/promises';
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

/** 読めなかったファイルを知らせる関数 */
export type ReadErrorHandler = (filePath: string, error: NodeJS.ErrnoException) => void;

/** 大きすぎるファイル（ビルド成果物など）は調べない */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * パターンに合うファイルを読み、それぞれに map を適用した結果をパス順に返す。
 * 大きすぎるファイルとバイナリファイルは飛ばす。読めないファイルは onReadError に知らせて飛ばす。
 */
export async function mapSourceFiles<T>(
  patterns: readonly string[],
  options: {
    cwd: string;
    ignore?: readonly string[];
    map: (source: string, filePath: string) => T;
    onReadError?: ReadErrorHandler;
  },
): Promise<T[]> {
  const files = await findFiles(patterns, options);
  const results = new Map<string, T>();
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const path = resolve(options.cwd, file);
      let source: string;
      try {
        if ((await stat(path)).size > MAX_FILE_SIZE) continue;
        source = await readFile(path, 'utf8');
      } catch (error) {
        // 読む権限がない、探したあとで消えた、など
        options.onReadError?.(file, error as NodeJS.ErrnoException);
        continue;
      }
      if (source.includes('\u0000')) continue;
      results.set(file, options.map(source, file));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return files.filter((file) => results.has(file)).map((file) => results.get(file)!);
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}
