import { describe, expect, it } from 'vitest';
import { kanjiToNumber } from '../src/rules/kanji-numeral.js';
import { check } from './helpers.js';

// 例文の多くは「わかりやすい情報提供に関するガイドライン」の悪い例・良い例から取っている

describe('difficult-word', () => {
  it('ガイドラインの悪い例のことばを指摘する', () => {
    const messages = check('資料の貸出延長はできません。ご事情のあるときは担当までご連絡ください。', 'difficult-word');
    expect(messages.join('\n')).toMatch(/「貸出」/);
    expect(messages.join('\n')).toMatch(/「延長」/);
    expect(messages.join('\n')).toMatch(/「ご事情」/);
    expect(messages.join('\n')).toMatch(/「担当」/);
  });

  it('ガイドラインの良い例は指摘しない', () => {
    expect(check('返すのが 遅れるときは、図書館に れんらくしてください。', 'difficult-word')).toEqual([]);
  });

  it('「等」を「など」にするよう指摘し、「平等」は指摘しない', () => {
    expect(check('障害者福祉施設従事者等による虐待', 'difficult-word').join()).toMatch(/「等」/);
    expect(check('みんな平等に使えます', 'difficult-word')).toEqual([]);
  });

  it('words と exclude で辞書を変えられる', () => {
    expect(check('削除します', 'difficult-word', { exclude: ['削除'] })).toEqual([]);
    expect(check('精査します', 'difficult-word', { words: { 精査: 'よく調べる' } })).toEqual([
      '「精査」は難しいことばです。「よく調べる」のように言いかえてください。',
    ]);
  });
});

describe('kanji-sequence', () => {
  it('漢字が4つ以上続くことばを指摘する', () => {
    expect(check('障害者福祉施設の人', 'kanji-sequence').join()).toMatch(/7文字/);
  });

  it('常とう語は指摘しない', () => {
    expect(check('駐車場は、身体障害者手帳を 見せると お金は いりません。', 'kanji-sequence')).toEqual([]);
  });
});

describe('kanji-grade', () => {
  it('小学3年生までに習わない漢字を指摘する', () => {
    expect(check('障害のある人', 'kanji-grade')).toEqual([
      '「障害」に小学3年生までに習わない漢字があります（障＝6年、害＝4年）。ひらがなにするか、ルビをふってください。',
    ]);
  });

  it('maxGrade で学年を変えられる', () => {
    expect(check('障害のある人', 'kanji-grade', { maxGrade: 6 })).toEqual([]);
  });

  it('<ruby> でルビをふった漢字は指摘しない', () => {
    const jsx = 'const a = <p><ruby>障害<rt>しょうがい</rt></ruby>のある人と<ruby>連絡<rt>れんらく</rt></ruby>する</p>;';
    expect(check(jsx, 'kanji-grade', undefined, 'a.tsx')).toEqual([]);
    const html = '<p><ruby>障害<rp>(</rp><rt>しょうがい</rt><rp>)</rp></ruby>のある人</p>';
    expect(check(html, 'kanji-grade', undefined, 'a.html')).toEqual([]);
    expect(check('<p>障害のある人</p>', 'kanji-grade', undefined, 'a.html')).toHaveLength(1);
  });
});

describe('double-negative', () => {
  it('ガイドラインの悪い例を指摘する', () => {
    expect(
      check('本の返却が遅れた場合、図書館に連絡をしないということはないようにしてください。', 'double-negative'),
    ).toEqual(['二重否定は使わず、直接的な表現にしてください：「ないということはない」']);
  });

  it('分かち書きの空白があっても見つける', () => {
    expect(check('連絡を しない ということは ない', 'double-negative')).toHaveLength(1);
  });

  it.each(['知らないわけではありません', '行かざるを得ない', '使えなくはない', '知らない人はいません'])(
    '「%s」を指摘する',
    (text) => {
      expect(check(text, 'double-negative')).toHaveLength(1);
    },
  );

  it('良い例は指摘しない', () => {
    expect(check('本の返却が 遅れた場合、図書館に 連絡してください。', 'double-negative')).toEqual([]);
  });

  it('obligation を有効にすると「なければなりません」も指摘する', () => {
    expect(check('出さなければなりません', 'double-negative')).toEqual([]);
    expect(check('出さなければなりません', 'double-negative', { obligation: true })).toHaveLength(1);
  });
});

describe('indirect-expression', () => {
  it.each(['対応いたしかねます', 'ご遠慮ください', '必要と思われます', '確認させていただきます'])(
    '「%s」を指摘する',
    (text) => {
      expect(check(text, 'indirect-expression')).toHaveLength(1);
    },
  );

  it('はっきりした表現は指摘しない', () => {
    expect(check('ここでは タバコを 吸わないでください。', 'indirect-expression')).toEqual([]);
  });
});

describe('demonstrative', () => {
  it('文のはじめの指示語を指摘する', () => {
    expect(check('図書カードを作りましょう。それを作ると、いつでも借りることができます。', 'demonstrative')).toEqual([
      '指示語「それを」が何を指すかわかりにくいです。指しているものを、もう一度書いてください。',
    ]);
  });

  it('ガイドラインの良い例は指摘しない', () => {
    expect(
      check('図書カードを 作りましょう。図書カードを 作ると、いつでも 借りることが できます。', 'demonstrative'),
    ).toEqual([]);
  });

  it('「これから」「それから」などは指摘しない', () => {
    expect(check('これから始めます。それから、名前を書きます。', 'demonstrative')).toEqual([]);
  });
});

describe('sentence-length', () => {
  it('30文字をこえる文を指摘する', () => {
    const text =
      '入居している障害のある方に対して、主に夜間において、共同生活住居で、入浴、排せつ、食事の介護、調理、洗濯、掃除等の家事を行います。';
    expect(check(text, 'sentence-length').join()).toMatch(/^一文が65文字あります/);
  });

  it('空白は数えない', () => {
    expect(check('食事や お風呂など 生活に かかわることを 手伝って もらえます。', 'sentence-length')).toEqual([]);
  });

  it('max で文字数を変えられる', () => {
    expect(check('食事やお風呂など生活にかかわることを手伝ってもらえます。', 'sentence-length', { max: 10 })).toHaveLength(1);
  });

  it('文は「。」で区切る', () => {
    expect(check('今日は晴れです。明日は雨です。あさっては雪です。', 'sentence-length', { max: 9 })).toEqual([]);
  });
});

describe('compound-sentence', () => {
  it('接続助詞で2つ以上つないだ文を指摘する', () => {
    expect(
      check('図書館の中で おしゃべりを する人が いますが、他の人に 迷惑なので、静かに しましょう。', 'compound-sentence'),
    ).toEqual(['一文の中で「ますが、」「ので、」のように文をつないでいます。ひとつの内容ごとに文を分けてください。']);
  });

  it('読点の多い文を指摘する', () => {
    expect(check('入浴、排せつ、食事、調理、洗濯をします。', 'compound-sentence').join()).toMatch(/読点（、）が4個/);
  });

  it('ガイドラインの良い例は指摘しない', () => {
    expect(check('おしゃべりは、他の人に 迷惑です。静かに しましょう。', 'compound-sentence')).toEqual([]);
  });
});

describe('loanword', () => {
  it('なじみのうすい外来語を指摘する', () => {
    expect(check('コンプライアンス、ダイバーシティ、アセスメント', 'loanword')).toHaveLength(3);
  });

  it('一般に広まっている外来語は指摘しない', () => {
    expect(check('テレビ、イメージ、スマホ', 'loanword')).toEqual([]);
  });

  it('短い語が長いカタカナ語の一部のときは指摘しない', () => {
    expect(check('キャパを確認', 'loanword')).toHaveLength(1);
    expect(check('キャパシティを確認', 'loanword')).toEqual(['なじみのうすい外来語「キャパシティ」は避けてください。「できる量」のように言いかえてください。']);
    expect(check('エスキャパレード', 'loanword')).toEqual([]);
  });
});

describe('kanji-numeral', () => {
  it('ガイドラインの悪い例を算用数字に直すよう提案する', () => {
    expect(check('本日十六時より開始します。', 'kanji-numeral')).toEqual([
      '漢数字は使わず、算用数字で書いてください：「十六時」→「午後4時」',
    ]);
  });

  it.each([
    ['三十分待ちます', '30分'],
    ['二〇二六年', '2026年'],
    ['一万二千円です', '12000円'],
    ['一つ選んでください', '1つ'],
  ])('「%s」→「%s」', (text, expected) => {
    expect(check(text, 'kanji-numeral').join()).toContain(`→「${expected}」`);
  });

  it.each(['一緒に暮らします', '十分に気をつけてください', 'もう一度やります', '統一します', '四日市市'])(
    '「%s」は指摘しない',
    (text) => {
      expect(check(text, 'kanji-numeral')).toEqual([]);
    },
  );

  it('漢数字を数に直す', () => {
    expect(kanjiToNumber('十六')).toBe(16);
    expect(kanjiToNumber('三百五')).toBe(305);
    expect(kanjiToNumber('二〇二六')).toBe(2026);
    expect(kanjiToNumber('一億二千万')).toBe(120_000_000);
  });
});

describe('time-24h', () => {
  it.each([
    ['受付は13:30からです', '午後1時30分'],
    ['１６時に集合', '午後4時'],
    ['20時15分まで', '午後8時15分'],
    ['24時まで', '午前0時'],
  ])('「%s」→「%s」', (text, expected) => {
    expect(check(text, 'time-24h').join()).toContain(`→「${expected}」`);
  });

  it.each(['午前10時に集合', '13時間かかります', '画面の比率は16:9です'])('「%s」は指摘しない', (text) => {
    expect(check(text, 'time-24h')).toEqual([]);
  });
});

describe('ruby-parentheses', () => {
  it('ガイドラインの悪い例を指摘する', () => {
    expect(
      check('図書館（としょかん）に メールアドレス（めーるあどれす）を 伝（つた）えてください。', 'ruby-parentheses'),
    ).toHaveLength(3);
  });

  it('カッコでの言いかえや説明は指摘しない', () => {
    expect(check('社会的障壁（社会のかべ）とは', 'ruby-parentheses')).toEqual([]);
    expect(check('ダイバーシティ（たようせい）', 'ruby-parentheses')).toEqual([]);
  });
});

describe('wakachigaki', () => {
  it('区切りのない長いかたまりを指摘する', () => {
    expect(check('予約をした本などがそろったときに、メールでれんらくしてもらえます。', 'wakachigaki')).toHaveLength(2);
  });

  it('分かち書きした文は指摘しない', () => {
    expect(check('予約をした 本などが そろったときに、メールで れんらくして もらえます。', 'wakachigaki')).toEqual([]);
  });
});
