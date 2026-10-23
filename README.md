# easy-ja-cli

ソースコードに書かれた日本語が「わかりやすい」かを調べる CLI です。

厚生労働省の[わかりやすい情報提供に関するガイドライン](https://www.mhlw.go.jp/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/dl/171020-01.pdf)（平成27年度障害者総合福祉推進事業、社会福祉法人大阪手をつなぐ育成会 作成）のうち、機械的に調べられる項目をルールにしています。画面の文言・エラーメッセージ・お知らせ文などを、知的障害のある人や外国人、高齢者、子どもにも伝わる日本語にするために使います。

```console
$ npx easy-ja examples/
examples/library-notice.tsx
  3:23   warning  「貸出」は難しいことばです。「貸す」のように言いかえてください。  difficult-word
  4:19   warning  漢数字は使わず、算用数字で書いてください：「十六時」→「午後4時」  kanji-numeral
  9:9    error    一文が39文字あります（目安は30文字以内）。文を分けてください：「本の返却が遅れた場合、図書館に連絡をしな…」  sentence-length
  9:28   error    二重否定は使わず、直接的な表現にしてください：「ないということはない」  double-negative
  12:10  error    読みがなをカッコ書きにしないでください：「図書館（としょかん）」。ルビは文字の上に小さく書きます（HTML では <ruby> を使います）。  ruby-parentheses
  13:13  error    時刻は24時間表記ではなく、午前・午後で書いてください：「13:30」→「午後1時30分」  time-24h
  （略）

✖ 33 件の問題（エラー 8 件、警告 25 件）
```

## インストール

Node.js 22.18 以上（または 24.11 以上）が必要です。

```sh
npm install --save-dev easy-ja-cli
```

## 使い方

```sh
npx easy-ja                    # カレントディレクトリ以下を調べる
npx easy-ja src docs/**/*.md   # ファイル・ディレクトリ・glob を指定する
npx easy-ja --comments src     # コメントも調べる
npx easy-ja --format github    # GitHub Actions の注釈として出力する
cat App.tsx | npx easy-ja --stdin --stdin-filename App.tsx
```

| オプション | 説明 |
| --- | --- |
| `-c, --config <path>` | 設定ファイルを指定する（既定では `.easyjarc.json` を上のディレクトリへ向かって探す） |
| `-f, --format <name>` | 出力形式。`stylish`（既定）・`json`・`github` |
| `--rule <id>=<重要度>` | ルールの重要度を変える。`error`・`warning`・`off`。何度でも指定できる |
| `--comments` | コメントも調べる |
| `--ignore <glob>` | 調べないファイル。何度でも指定できる |
| `-q, --quiet` | エラーだけを表示する |
| `--max-warnings <n>` | 警告が n 件をこえたら失敗にする |
| `--stdin` / `--stdin-filename <名前>` | 標準入力から読む。名前の拡張子で調べ方が決まる |
| `--list-rules` | ルールの一覧を表示する |
| `--init` | 設定ファイル `.easyjarc.json` を作る |
| `--no-color` | 色を付けない |

終了コードは、問題なし（警告だけを含む）が `0`、エラーがあるか警告が `--max-warnings` をこえたときが `1`、設定や引数がまちがっているときが `2` です。

## ルール

| ルール | 既定 | 調べること | ガイドライン |
| --- | --- | --- | --- |
| `difficult-word` | warning | 難しいことば（「貸出」「速やかに」「当該」など約180語）。言いかえの例を示す | p.2 難しいことばは使わない |
| `kanji-sequence` | warning | 漢字が4文字以上続くことば | p.2 漢字が４つ以上連なることばは避ける |
| `kanji-grade` | warning | 小学3年生までに習わない漢字。`<ruby>` でルビをふった漢字は対象外 | p.2 小学校 2〜3 年生までの漢字を使い、漢字にはルビをふる |
| `double-negative` | error | 二重否定（「しないということはない」「ざるを得ない」など） | p.3 二重否定は使わない |
| `indirect-expression` | warning | 遠回しな表現（「いたしかねます」「ご遠慮ください」「と思われます」など） | p.3 婉曲的な表現を避け、直接的な表現にする |
| `demonstrative` | warning | 文のはじめで前の文を指す指示語（「それを」「これは」など） | p.3 指示語を多用せず、あえて二度書く |
| `sentence-length` | error | 30文字をこえる文（空白は数えない） | p.4 一文は 30 字以内を目安にする |
| `compound-sentence` | warning | 「〜が、」「〜ので、」で2つ以上つないだ文、読点が4つ以上ある文 | p.4 一文はひとつの内容にする |
| `loanword` | warning | なじみのうすい外来語（「コンプライアンス」「エビデンス」など約70語） | p.5 なじみのうすい外来語等は避ける |
| `kanji-numeral` | warning | 漢数字（「十六時」「三十分」など）。算用数字での書き方を示す | p.5 漢数字は用いない |
| `time-24h` | error | 24時間表記の時刻（「16時」「13:30」）。午前・午後での書き方を示す | p.5 時刻は24時間表記ではなく、午前・午後などで表記する |
| `ruby-parentheses` | error | カッコ書きの読みがな（「図書館（としょかん）」） | p.6 漢字の後にカッコ書きで表記しない |
| `wakachigaki` | off | 空白で区切られていない長い文字のかたまり | p.6 意味のある単位で分かち書きにする |

### 調べられないこと

次の項目は文脈や見た目の判断が必要なため、このツールでは調べません。レビューで確かめてください。

- 比喩・暗喩・擬人法を使っていないか（p.3）
- 主語を省いていないか（p.5）
- 必要度の低い情報を削ったか、具体的な情報を入れたか（p.2・p.3）
- 話が時系列に沿っているか、手順に番号を付けているか（p.4）
- 名称などの表記を統一しているか（p.3）
- 文字の大きさ、写真・イラスト・絵記号、レイアウト（p.6・p.7）
- 口頭での説明や動画・音声などの併用、読み手の年齢に合ったことば（p.8）

## 調べる場所

日本語（ひらがな・カタカナ・漢字）を含む部分だけを調べます。

| ファイル | 調べる部分 |
| --- | --- |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` `.mts` `.cts` | 文字列・テンプレートリテラル・JSX のテキストと属性 |
| `.vue` `.svelte` `.html` `.xml` | テキスト・属性・`{{ }}` やバインド属性の中の文字列・`<script>` |
| `.md` `.mdx` | 本文・見出し・リスト・表（コードブロックは除く） |
| `.json` `.yml` `.yaml` `.po` `.arb` | 値（i18n の翻訳ファイルなど） |
| `.py` `.rb` `.go` `.java` `.kt` `.swift` `.dart` `.rs` `.php` `.c` `.cpp` `.cs` など | 文字列 |
| `.txt` | 全体 |

- コメントは既定では調べません（読み手が開発者のため）。`--comments` か設定の `comments: true` で調べます。
- JSX や HTML では、`<a>` `<strong>` `<ruby>` などのインライン要素をはさんだ文も1つの文として数えます。`<rt>` `<rp>` の読みがなは数えません。
- `{name}`・`${name}`・`{{ name }}`・`%s` などのプレースホルダーは1文字として数えます。
- `import` のパスは調べません。
- `node_modules`・`dist`・`build`・`coverage` などは調べません。

## 設定

`npx easy-ja --init` で、すべてのルールを既定値で並べた `.easyjarc.json` を作れます。`package.json` の `"easyJa"` に書くこともできます。

```json
{
  "rules": {
    "sentence-length": ["error", { "max": 40 }],
    "kanji-grade": ["warning", { "maxGrade": 4 }],
    "difficult-word": ["warning", { "words": { "精査": "よく調べる" }, "exclude": ["削除"] }],
    "wakachigaki": "warning"
  },
  "allow": ["個人情報保護方針", "利用規約"],
  "include": ["src"],
  "ignore": ["**/*.test.ts", "**/__mocks__/**"],
  "comments": false
}
```

| キー | 説明 |
| --- | --- |
| `rules` | ルールごとに `"error"`・`"warning"`・`"off"`、またはオプション付きの `["error", { ... }]` |
| `allow` | 常とう語（ある場面でいつも決まって使われることば）。漢字・難しいことば・外来語などのチェックから外す。「身体障害者手帳」「生年月日」などはあらかじめ入っている |
| `include` | パスを指定しなかったときに調べる場所（既定は `["."]`） |
| `ignore` | 調べないファイルの glob |
| `comments` | コメントも調べるか |

`include`・`ignore` のパスは、コマンドを実行したディレクトリからの相対パスです。

### ルールのオプション

| ルール | オプション | 既定値 |
| --- | --- | --- |
| `sentence-length` | `max`：一文の最大文字数 | `30` |
| `kanji-sequence` | `max`：続けてよい漢字の数 | `3` |
| `kanji-grade` | `maxGrade`：何年生までの漢字を使ってよいか（1〜6） | `3` |
| `difficult-word` | `words`：追加することばと言いかえ、`exclude`：辞書から外すことば | `{}`・`[]` |
| `loanword` | `words`・`exclude`（`difficult-word` と同じ） | `{}`・`[]` |
| `double-negative` | `obligation`：「〜なければなりません」も指摘するか | `false` |
| `kanji-numeral` | `exceptions`：数として扱わないことば（「十分」「一番」など） | 約25語 |
| `compound-sentence` | `maxConnectives`：一文の中で使ってよい接続助詞の数、`maxCommas`：読点の数 | `1`・`3` |
| `wakachigaki` | `max`：区切りなしで続けてよい文字数 | `10` |

## コメントで指摘を止める

コメントの書き方（`//`・`#`・`<!-- -->` など）は問いません。ルールを省くと、すべてのルールが対象になります。

```tsx
// easy-ja-disable-next-line sentence-length
const terms = '本サービスの利用にあたっては、以下の利用規約に同意していただく必要があります。';

const label = '至急'; // easy-ja-disable-line difficult-word

/* easy-ja-disable kanji-grade */
const legal = { ... };
/* easy-ja-enable */
```

## CI で使う

```yaml
# .github/workflows/easy-ja.yml
name: easy-ja
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx easy-ja --format github
```

`--format github` を使うと、プルリクエストの差分の該当行に注釈が付きます。

## プログラムから使う

```ts
import { lintText, lintFiles, loadConfig, resolveConfig } from 'easy-ja-cli';

const result = lintText('本日十六時より開始します。');
console.log(result.issues);
// [{ ruleId: 'difficult-word', message: '「本日」は難しいことばです。…', line: 1, column: 1, … }, …]

const { config } = await loadConfig();
const results = await lintFiles(['src'], { config: resolveConfig(config) });
```

`lintText` の `filePath` に拡張子付きの名前を渡すと、その種類のファイルとして調べます（例：`{ filePath: 'App.tsx' }`）。

## データについて

- 学年別の漢字は、文部科学省「小学校学習指導要領」（2017年告示・2020年施行）の学年別漢字配当表（1026字）を使っています。
- 難しいことば・外来語の辞書は、ガイドラインの例と、公用文によく出る言い回しをもとに作ったものです。言いかえは一例です。文脈に合わせて選んでください。

## 開発

```sh
npm install
npm test           # テスト
npm run typecheck  # 型チェック
npm run build      # dist/ に出力
node bin/easy-ja.js examples/
```
