import { defineRule, type RuleReport } from './types.js';

const DIGITS: Readonly<Record<string, number>> = {
  〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const SMALL_UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
const LARGE_UNITS: Readonly<Record<string, number>> = { 万: 1e4, 億: 1e8, 兆: 1e12 };

// 数のあとに続く助数詞。これが続くときだけ1文字の漢数字を数として扱う
const COUNTERS = [
  '時間', '時', '分', '秒', '日', '週', 'か月', 'ヶ月', 'カ月', 'ケ月', '箇月', '月', '年', '円',
  '人', '名', '個', '回', '歳', '才', '件', '枚', '冊', '台', '階', '番目', '本', '匹', '頭',
  '杯', '点', '割', 'つ', 'か所', 'ヶ所', 'カ所', '箇所', '号', '丁目', '番地', '泊', '通', '歩',
  '社', '校', '列', '行', '組', '軒', '席', '代', '世紀', '倍', '位', '度', 'キロ', 'メートル',
  'グラム', 'リットル', 'センチ', 'パーセント', '％', '%', 'ページ',
];

// 漢数字＋助数詞の形をしているが、数ではないことば
const DEFAULT_EXCEPTIONS = [
  '十分', '一時', '一番', '一度', '二度と', '一部', '一面', '一通り', '一人前', '一人ひとり',
  '一人一人', '万一', '万人', '万年筆', '三日月', '三日坊主', '四六時中', '五十音', '八百屋',
  '十人十色', '七五三', '一期一会', '千代田', '四日市', '十日町',
];

export function kanjiToNumber(text: string): number {
  if ([...text].every((ch) => ch in DIGITS)) {
    return Number([...text].map((ch) => DIGITS[ch]).join(''));
  }
  let total = 0;
  let section = 0;
  let current = 0;
  for (const ch of text) {
    if (ch in DIGITS) {
      current = current * 10 + DIGITS[ch]!;
    } else if (ch in SMALL_UNITS) {
      section += (current || 1) * SMALL_UNITS[ch]!;
      current = 0;
    } else if (ch in LARGE_UNITS) {
      total += (section + current || 1) * LARGE_UNITS[ch]!;
      section = 0;
      current = 0;
    }
  }
  return total + section + current;
}

export default defineRule({
  id: 'kanji-numeral',
  description: '漢数字を使っていないか',
  guideline: 'p.5「漢数字は用いない」',
  defaultSeverity: 'warning',
  defaultOptions: { exceptions: DEFAULT_EXCEPTIONS as string[] },
  check({ masked, options }) {
    const excepted = new Set<number>();
    for (const word of options.exceptions) {
      let at = masked.indexOf(word);
      while (at !== -1) {
        for (let i = at; i < at + word.length; i++) excepted.add(i);
        at = masked.indexOf(word, at + 1);
      }
    }

    const reports: RuleReport[] = [];
    for (const m of masked.matchAll(/[〇一二三四五六七八九十百千万億兆]+/g)) {
      const run = m[0];
      if (excepted.has(m.index)) continue;
      const counter = COUNTERS.find((c) => masked.startsWith(c, m.index + run.length));
      const isNumber = run.length >= 2 && /[〇一二三四五六七八九]{2}|[十百千万億兆]/.test(run);
      if (!isNumber && !counter) continue;

      const value = kanjiToNumber(run);
      let suggestion = `${value}${counter ?? ''}`;
      if (counter === '時' && value >= 13 && value <= 24) suggestion = `午後${value - 12}時`;
      reports.push({
        index: m.index,
        length: run.length + (counter?.length ?? 0),
        message: `漢数字は使わず、算用数字で書いてください：「${run}${counter ?? ''}」→「${suggestion}」`,
        suggestion,
      });
    }
    return reports;
  },
});
