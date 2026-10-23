import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { ConfigError, resolveConfig } from '../src/config.js';
import { lintText } from '../src/linter.js';
import { listSegments } from '../src/segments.js';
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

describe('--format segments', () => {
  it('チェックはせず、日本語の文字列を位置つきで一覧にする', async () => {
    await writeFile(join(dir, 'a.tsx'), 'const a = <p>\n  {name}さん、\n  こんにちは。\n</p>;\nconst b = "en";\n');
    await writeFile(join(dir, 'b.ts'), 'const b = "no japanese";\n');
    const { code, stdout } = await run(['--format', 'segments']);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual([
      {
        filePath: 'a.tsx',
        segments: [
          { kind: 'jsx-text', text: '{…}さん、\n  こんにちは。', line: 2, column: 3, endLine: 3, endColumn: 9 },
        ],
      },
    ]);
  });

  it('標準入力からも読める', async () => {
    const { stdout } = await run(['--format', 'segments', '--stdin'], '至急です');
    const [file] = JSON.parse(stdout);
    expect(file.filePath).toBe('<stdin>');
    expect(file.segments[0]).toMatchObject({ text: '至急です', line: 1, column: 1 });
  });

  it('終わりの位置は、末尾の埋め込み式やエスケープの後ろを指す', () => {
    const source = 'const a = <p>こんにちは{name}</p>;\nconst b = "おわり\\u3002";\nconst c = `合計${n}`;\n';
    const lines = source.split('\n');
    const spans = listSegments(source, { filePath: 'a.tsx' }).segments.map((s) =>
      lines[s.line - 1]!.slice(s.column - 1, s.endColumn - 1),
    );
    expect(spans).toEqual(['こんにちは{name}', 'おわり\\u3002', '合計${n}']);
  });
});

describe('ファイルの読み込み', () => {
  it('大きすぎるファイルとバイナリファイルは飛ばし、結果はパスの順に並べる', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'c.ts'), 'const c = "至急";\n');
    await writeFile(join(dir, 'b.ts'), 'const b = "至急";\n');
    await writeFile(join(dir, 'a.ts'), 'const a = "至急";\n');
    await writeFile(join(dir, 'big.ts'), `const a = "至急";\n${'//\n'.repeat(1024 * 1024)}`);
    await writeFile(join(dir, 'bin.ts'), 'const a = "至急";\u0000');
    const { stdout } = await run(['--format', 'json']);
    expect(JSON.parse(stdout).map((r: { filePath: string }) => r.filePath)).toEqual(['a.ts', 'b.ts', 'sub/c.ts']);
  });

  // root は権限がなくても読めてしまう
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    '読めないファイルは知らせて飛ばし、ほかのファイルは調べる',
    async () => {
      await writeFile(join(dir, 'a.ts'), 'const a = "至急";\n');
      await writeFile(join(dir, 'noread.ts'), 'const b = "至急";\n');
      await chmod(join(dir, 'noread.ts'), 0o000);
      for (const format of ['json', 'segments']) {
        const { stdout, stderr } = await run(['--format', format]);
        expect(JSON.parse(stdout).map((r: { filePath: string }) => r.filePath)).toEqual(['a.ts']);
        expect(stderr).toContain('noread.ts を読めなかったので飛ばしました（EACCES）');
      }
    },
  );
});

describe('--init-skill', () => {
  it('既定では .agents/skills/easy-ja に置く', async () => {
    const { code } = await run(['--init-skill']);
    expect(code).toBe(0);
    const skill = await readFile(join(dir, '.agents', 'skills', 'easy-ja', 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: easy-ja\n/);
  });

  it('claude を付けると .claude/skills/easy-ja に置く', async () => {
    expect((await run(['--init-skill', 'claude'])).code).toBe(0);
    await expect(readFile(join(dir, '.claude', 'skills', 'easy-ja', 'SKILL.md'), 'utf8')).resolves.toContain(
      'name: easy-ja',
    );
  });

  it('すでにあれば上書きしない', async () => {
    await mkdir(join(dir, '.agents', 'skills', 'easy-ja'), { recursive: true });
    await writeFile(join(dir, '.agents', 'skills', 'easy-ja', 'SKILL.md'), '自分で書きかえた');
    expect((await run(['--init-skill'])).code).toBe(2);
    expect(await readFile(join(dir, '.agents', 'skills', 'easy-ja', 'SKILL.md'), 'utf8')).toBe('自分で書きかえた');
  });

  it('知らない置き場所は 2 で終わる', async () => {
    expect((await run(['--init-skill', 'cursor'])).code).toBe(2);
  });

  // Windows ではシンボリックリンクを作るのに権限が要る
  it.skipIf(process.platform === 'win32')('置き場所がリンク切れのシンボリックリンクでも上書きしない', async () => {
    await mkdir(join(dir, '.agents', 'skills'), { recursive: true });
    await symlink(join(dir, 'nowhere'), join(dir, '.agents', 'skills', 'easy-ja'));
    const { code, stderr } = await run(['--init-skill']);
    expect(code).toBe(2);
    expect(stderr).toContain('すでにあります');
  });

  it('--init と一緒に付けると、両方を行う', async () => {
    expect((await run(['--init', '--init-skill', 'claude'])).code).toBe(0);
    await expect(readFile(join(dir, '.easyjarc.json'), 'utf8')).resolves.toContain('"rules"');
    await expect(readFile(join(dir, '.claude', 'skills', 'easy-ja', 'SKILL.md'), 'utf8')).resolves.toContain(
      'name: easy-ja',
    );
  });
});

describe('同梱のスキル', () => {
  it('Agent Skills の規格に合っている（name がフォルダ名と同じ、description が 1024 文字以内）', async () => {
    const skill = await readFile(new URL('../skills/easy-ja/SKILL.md', import.meta.url), 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)![1]!;
    expect(/^name: (.+)$/m.exec(frontmatter)![1]).toBe('easy-ja');
    expect([.../^description: (.+)$/m.exec(frontmatter)![1]!].length).toBeLessThanOrEqual(1024);
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
