import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { extract } from '../src/extractors/index.js';
import { lintText } from '../src/linter.js';
import { OBJ } from '../src/text/chars.js';
import { only } from './helpers.js';

const texts = (source: string, filePath: string, comments = false) =>
  extract(source, filePath, { comments }).map((s) => s.text.trim());

/** 指摘の位置を「行:列」で返す */
const positions = (source: string, filePath: string, id = 'difficult-word') =>
  lintText(source, { filePath, config: only(id) }).issues.map((i) => `${i.line}:${i.column}`);

describe('JavaScript / TypeScript', () => {
  it('文字列リテラルのエスケープを解き、元の位置を返す', () => {
    const source = 'const a = 1;\nconst msg = "こんにちは\\n至急来てください";';
    expect(texts(source, 'a.ts')).toEqual(['こんにちは\n至急来てください']);
    // 「至急」は2行目の 21 文字目（ソース上の \n は2文字）
    expect(positions(source, 'a.ts')).toEqual(['2:21']);
  });

  it('テンプレートリテラルの式は1文字として数える', () => {
    const [segment] = extract('const t = `${n}件のお知らせ`;', 'a.js', { comments: false });
    expect(segment!.text).toBe(`${OBJ}件のお知らせ`);
  });

  it('JSX のテキストは、行をまたいでもインライン要素をはさんでも1つの文として扱う', () => {
    const source = [
      'const el = (',
      '  <p>',
      '    詳しくは<a href="/help">ヘルプ</a>を',
      '    見てください。',
      '  </p>',
      ');',
    ].join('\n');
    const [segment] = extract(source, 'a.jsx', { comments: false });
    expect(segment!.text.replace(/\s+/g, '')).toBe('詳しくはヘルプを見てください。');
  });

  it('ブロック要素やコンポーネントは文の区切りになる', () => {
    expect(texts('<div><h1>見出し</h1><Card>本文</Card></div>', 'a.tsx')).toEqual(['見出し', '本文']);
  });

  it('JSX の属性と、式の中の文字列も調べる', () => {
    const source = '<img alt="施設の写真" title={ok ? "成功" : "失敗"} />';
    expect(texts(source, 'a.tsx')).toEqual(['施設の写真', '成功', '失敗']);
  });

  it('import のパスは調べない', () => {
    expect(texts('import x from "./日本語.js";\nexport * from "./漢字.js";', 'a.ts')).toEqual([]);
  });

  it('コメントは comments を有効にしたときだけ調べる', () => {
    const source = '// 一行目の\n// コメントです\n/**\n * ブロック\n */\nconst a = 1;';
    expect(texts(source, 'a.ts')).toEqual([]);
    expect(texts(source, 'a.ts', true).map((t) => t.replace(/\s+/g, ''))).toEqual(['一行目のコメントです', 'ブロック']);
  });

  it('構文エラーがあっても文字列は拾う', () => {
    expect(texts('const a = "至急" +++ ;; }}}', 'a.js')).toContain('至急');
  });
});

describe('Vue / Svelte / HTML', () => {
  it('Vue のテンプレート・バインド属性・script を調べる', () => {
    const source = [
      '<template>',
      '  <p :title="ok ? \'はい\' : \'いいえ\'">{{ count }}件の書類</p>',
      '</template>',
      '<script setup lang="ts">',
      'const m: string = "スクリプト";',
      '</script>',
    ].join('\n');
    expect(texts(source, 'a.vue').sort()).toEqual(['いいえ', 'はい', 'スクリプト', `${OBJ}件の書類`].sort());
  });

  it('Svelte の {#if} は文字として数えない', () => {
    expect(texts('<p>{#if a}こんにちは{/if}</p>', 'a.svelte')).toEqual(['こんにちは']);
  });

  it('HTML の style・rt は調べず、alt 属性は調べる', () => {
    const source = '<style>p::before{content:"装飾"}</style><img alt="外観写真"><p><ruby>漢字<rt>かんじ</rt></ruby>です</p>';
    expect(texts(source, 'a.html')).toEqual(['外観写真', '漢字です']);
  });

  it('属性の位置を返す', () => {
    expect(positions('<p>\n  <img alt="至急です">\n</p>', 'a.html')).toEqual(['2:13']);
  });
});

describe('そのほかの言語', () => {
  it('Python の三重引用符とコメント', () => {
    const source = '# コメント\nmsg = """\n複数行の\n文字列"""\nname = f"{name}さん"';
    expect(texts(source, 'a.py')).toEqual(['複数行の\n文字列', `${OBJ}さん`]);
    expect(texts(source, 'a.py', true)).toContain('コメント');
  });

  it('JSON の値（プレースホルダーは1文字として数える）', () => {
    expect(texts('{"msg": "{count}件を削除しました", "en": "hello"}', 'ja.json')).toEqual([`${OBJ}件を削除しました`]);
  });

  it('Go の raw 文字列', () => {
    expect(texts('s := `こんにちは`', 'a.go')).toEqual(['こんにちは']);
  });
});

describe('Markdown', () => {
  it('コードブロックとフロントマターを除き、リンクは文字の部分を調べる', () => {
    const source = [
      '---',
      'title: タイトル',
      '---',
      '# 見出し',
      '',
      '[ヘルプ](https://example.com)を`code`で',
      '見てください。',
      '',
      '```js',
      'const a = "無視";',
      '```',
    ].join('\n');
    expect(texts(source, 'a.md')).toEqual(['見出し', `ヘルプを${OBJ}で\n見てください。`]);
  });

  it('リストの項目と表のセルは別々に調べる', () => {
    const source = '- 一つ目\n- 二つ目\n\n| 名前 | 説明 |\n| --- | --- |\n| 項目 | 内容 |';
    expect(texts(source, 'a.md')).toEqual(['一つ目', '二つ目', '名前', '説明', '項目', '内容']);
  });
});

describe('YAML', () => {
  it('引用符つき・なし・ブロックスカラーの値を調べ、キーは調べない', () => {
    const source = [
      'ja:',
      '  a: "至急\\n来てください"',
      '  b: 下記のとおり # コメント',
      '  c: |',
      '    一行目',
      '    二行目',
      '  キー: 値',
      '  list:',
      '    - 項目',
    ].join('\n');
    expect(texts(source, 'a.yml')).toEqual(['至急\n来てください', '下記のとおり', '一行目\n二行目', '値', '項目']);
    expect(positions(source, 'a.yml')).toEqual(['2:7', '3:6']);
  });
});

describe('許可語', () => {
  it('allow のことばはチェックしない', () => {
    const config = resolveConfig({ allow: ['個人情報保護方針'] });
    const issues = lintText('個人情報保護方針', { config }).issues;
    expect(issues).toEqual([]);
  });
});
