import { defineRule, wholeSentence, type RuleReport } from './types.js';

// 文と文をつなぐ接続助詞（読点が続くもの）
const CONNECTIVES =
  /(?:ました|でした|った|いた|した|んだ|ます|です|ない|ある|いる|だ)が、|けれど(?:も)?、|けど、|ので、|のに、|ながら、|(?<=[るたいだ])ため(?:に)?、|(?:だ|ある|いる|ない|です|ます|した)し、|(?<=[いだるす])から、/g;
const COMMAS = /[、，]/g;

export default defineRule({
  id: 'compound-sentence',
  description: '一文に複数の内容を詰めこんでいないか',
  guideline: 'p.4「一文はひとつの内容にする」「接続詞を用いた複文や情報の羅列などは避け」',
  defaultSeverity: 'warning',
  defaultOptions: { maxConnectives: 1, maxCommas: 3 },
  check(context) {
    const { masked, options } = context;
    const reports: RuleReport[] = [];

    const connectives = [...masked.matchAll(CONNECTIVES)];
    if (connectives.length > options.maxConnectives) {
      const words = connectives.map((m) => `「${m[0]}」`).join('');
      reports.push(
        wholeSentence(context, `一文の中で${words}のように文をつないでいます。ひとつの内容ごとに文を分けてください。`),
      );
    }

    const commas = masked.match(COMMAS)?.length ?? 0;
    if (commas > options.maxCommas) {
      reports.push(
        wholeSentence(context, `読点（、）が${commas}個あります。伝える情報を減らすか、箇条書きにしてください。`),
      );
    }
    return reports;
  },
});
