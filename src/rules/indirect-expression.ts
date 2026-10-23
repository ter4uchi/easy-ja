import { defineRule, type RuleReport } from './types.js';

const PATTERNS: readonly { re: RegExp; advice: string }[] = [
  { re: /かね(?:ます|る)/g, advice: '「できません」とはっきり書いてください' },
  { re: /させて(?:いただき|頂き)(?:ます|たい)/g, advice: '「します」と書いてください' },
  {
    re: /(?:いただけ|頂け|もらえ)(?:れば|ますと|たら)(?:幸い|ありがたい|うれしい|助かり|助かる)/g,
    advice: '「〜してください」と書いてください',
  },
  {
    re: /(?:いただけ|頂け|もらえ)(?:ます|ない)(?:でしょう)?か/g,
    advice: 'お願いするときは「〜してください」と書いてください',
  },
  { re: /(?:ご|お)遠慮(?:ください|下さい|願います|ねがいます)/g, advice: '「〜しないでください」と書いてください' },
  { re: /お控え(?:ください|下さい|願います|ねがいます)/g, advice: '「〜しないでください」と書いてください' },
  { re: /と(?:思われ|考えられ|見られ)(?:ます|る)/g, advice: 'わかっていることは、言い切ってください' },
  { re: /ではないでしょうか/g, advice: '言い切る形にしてください' },
  { re: /(?:恐れ|おそれ)入りますが/g, advice: 'なくても意味が伝わります' },
  { re: /差し支え(?:なければ|ない)/g, advice: '「よければ」など、やさしいことばにしてください' },
  { re: /のほど/g, advice: '「〜してください」と書いてください' },
];

export default defineRule({
  id: 'indirect-expression',
  description: '遠回しな表現を使っていないか',
  guideline: 'p.3「微妙なニュアンスを再現しようと婉曲的な表現をしたり、断定を避けたりすることで、伝えたい情報がぼやけてしまう」',
  defaultSeverity: 'warning',
  defaultOptions: {},
  check({ masked }) {
    const reports: RuleReport[] = [];
    for (const { re, advice } of PATTERNS) {
      for (const m of masked.matchAll(re)) {
        reports.push({
          index: m.index,
          length: m[0].length,
          message: `遠回しな表現「${m[0]}」は避けてください。${advice}。`,
        });
      }
    }
    return reports;
  },
});
