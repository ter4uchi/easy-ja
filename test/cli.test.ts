import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { ConfigError, resolveConfig } from '../src/config.js';
import { lintText } from '../src/linter.js';
import { only } from './helpers.js';

class Capture extends Writable {
  data = '';
  override _write(chunk: Buffer, _: BufferEncoding, done: () => void) {
    this.data += chunk.toString();
    done();
  }
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'easy-ja-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(args: string[], stdin = '') {
  const stdout = new Capture();
  const stderr = new Capture();
  const code = await main(args, { stdout, stderr, stdin: Readable.from([stdin]), cwd: dir, env: {} });
  return { code, stdout: stdout.data, stderr: stderr.data };
}

describe('CLI', () => {
  it('問題がなければ 0 で終わる', async () => {
    await writeFile(join(dir, 'ok.ts'), 'const a = "今日は 晴れです。";\n');
    const { code, stdout } = await run([]);
    expect(code).toBe(0);
    expect(stdout).toContain('問題は見つかりませんでした（1 ファイル）');
  });

  it('エラーがあれば 1 で終わり、ファイル名と位置を表示する', async () => {
    await writeFile(join(dir, 'ng.ts'), 'const a = "図書館（としょかん）";\n');
    const { code, stdout } = await run(['ng.ts']);
    expect(code).toBe(1);
    expect(stdout).toContain('ng.ts');
    expect(stdout).toMatch(/1:12\s+error\s+読みがなをカッコ書きにしないでください/);
  });

  it('警告だけなら 0、--max-warnings をこえると 1', async () => {
    await writeFile(join(dir, 'w.ts'), 'const a = "至急";\n');
    expect((await run(['w.ts'])).code).toBe(0);
    expect((await run(['w.ts', '--max-warnings', '0'])).code).toBe(1);
  });

  it('--rule で重要度を変えられる', async () => {
    await writeFile(join(dir, 'w.ts'), 'const a = "至急";\n');
    expect((await run(['w.ts', '--rule', 'difficult-word=error'])).code).toBe(1);
    const off = JSON.parse((await run(['w.ts', '--rule', 'difficult-word=off', '--format', 'json'])).stdout);
    expect(off[0].issues.map((i: { ruleId: string }) => i.ruleId)).toEqual(['kanji-grade']);
  });

  it('json 形式で出力する', async () => {
    await writeFile(join(dir, 'w.ts'), 'const a = "至急";\n');
    const results = JSON.parse((await run(['--format', 'json', '--rule', 'kanji-grade=off'])).stdout);
    expect(results[0]).toMatchObject({
      filePath: 'w.ts',
      issues: [{ ruleId: 'difficult-word', line: 1, column: 12, endLine: 1, endColumn: 14, suggestion: 'すぐに' }],
    });
  });

  it('github 形式で出力する', async () => {
    await writeFile(join(dir, 'w.ts'), 'const a = "至急";\n');
    const { stdout } = await run(['--format', 'github', '--rule', 'kanji-grade=off']);
    expect(stdout).toBe(
      '::warning file=w.ts,line=1,col=12,endLine=1,endColumn=14,title=easy-ja (difficult-word)::「至急」は難しいことばです。「すぐに」のように言いかえてください。\n',
    );
  });

  it('標準入力から読む', async () => {
    const { code, stdout } = await run(['--stdin', '--stdin-filename', 'App.tsx'], 'const a = <p>本日十六時から</p>;');
    expect(code).toBe(0);
    expect(stdout).toContain('App.tsx');
    expect(stdout).toContain('「十六時」→「午後4時」');
  });

  it('設定ファイルを読む', async () => {
    await writeFile(join(dir, '.easyjarc.json'), JSON.stringify({ rules: { 'difficult-word': 'error' } }));
    await writeFile(join(dir, 'w.ts'), 'const a = "至急";\n');
    expect((await run([])).code).toBe(1);
  });

  it('--init で設定ファイルを作り、2回目は上書きしない', async () => {
    expect((await run(['--init'])).code).toBe(0);
    const config = JSON.parse(await readFile(join(dir, '.easyjarc.json'), 'utf8'));
    expect(config.rules['sentence-length']).toEqual(['error', { max: 30 }]);
    expect(config.rules.wakachigaki).toEqual(['off', { max: 10 }]);
    expect((await run(['--init'])).code).toBe(2);
  });

  it('引数や設定のまちがいは 2 で終わる', async () => {
    expect((await run(['--format', 'xml'])).code).toBe(2);
    expect((await run(['--rule', 'no-such-rule=off'])).code).toBe(2);
    expect((await run(['--unknown-flag'])).code).toBe(2);
    expect((await run(['missing.ts'])).code).toBe(2);
  });

  it('--list-rules ですべてのルールを表示する', async () => {
    const { stdout } = await run(['--list-rules']);
    expect(stdout).toContain('sentence-length');
    expect(stdout).toContain('p.4「一文は 30 字以内を目安にする」');
  });

  it('node_modules などは調べない', async () => {
    await mkdir(join(dir, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(dir, 'node_modules', 'x', 'a.js'), 'const a = "至急";\n');
    const results = JSON.parse((await run(['--format', 'json'])).stdout);
    expect(results).toEqual([]);
  });
});

describe('設定', () => {
  it('不明なルールやオプションの型のまちがいはエラーにする', () => {
    expect(() => resolveConfig({ rules: { nope: 'error' } })).toThrow(ConfigError);
    expect(() => resolveConfig({ rules: { 'sentence-length': ['error', { max: '30' }] } })).toThrow(ConfigError);
    expect(() => resolveConfig({ rules: { 'sentence-length': ['error', { min: 1 }] } })).toThrow(ConfigError);
  });

  it('wakachigaki は既定で無効', () => {
    expect(resolveConfig().rules.map((r) => r.rule.id)).not.toContain('wakachigaki');
  });
});

describe('指示コメント', () => {
  const source = [
    '// easy-ja-disable-next-line',
    'a("至急");',
    'a("至急"); // easy-ja-disable-line kanji-sequence',
    'a("至急"); // easy-ja-disable-line difficult-word',
    '/* easy-ja-disable difficult-word */',
    'a("至急");',
    '/* easy-ja-enable */',
    'a("至急");',
  ].join('\n');

  it('指定した行・ルールの指摘を止める', () => {
    const lines = lintText(source, { filePath: 'a.js', config: only('difficult-word') }).issues.map((i) => i.line);
    expect(lines).toEqual([3, 8]);
  });
});
