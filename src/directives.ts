import { ruleMap } from './rules/index.js';

/**
 * ソース中の指示コメントで、指摘を止める。
 *
 *   easy-ja-disable-next-line [ルール…]  次の行
 *   easy-ja-disable-line [ルール…]       この行
 *   easy-ja-disable [ルール…]            ここから easy-ja-enable まで
 *
 * コメントの書き方（// や # や <!-- -->）は問わない。ルールを省くとすべてのルールが対象になる。
 */
export function createSuppressor(source: string): (line: number, ruleId: string) => boolean {
  const ALL = '*';
  const perLine = new Map<number, Set<string>>();
  const ranges: { from: number; to: number; rule: string }[] = [];
  const open = new Map<string, number>();

  const add = (line: number, rule: string) => {
    let set = perLine.get(line);
    if (!set) perLine.set(line, (set = new Set()));
    set.add(rule);
  };

  const lines = source.split(/\r?\n/);
  lines.forEach((text, i) => {
    const line = i + 1;
    for (const m of text.matchAll(/easy-ja-(disable-next-line|disable-line|disable|enable)\b([^\n]*)/g)) {
      const targets = parseRules(m[2]!);
      const ids = targets.length ? targets : [ALL];
      for (const id of ids) {
        switch (m[1]) {
          case 'disable-next-line':
            add(line + 1, id);
            break;
          case 'disable-line':
            add(line, id);
            break;
          case 'disable':
            if (!open.has(id)) open.set(id, line);
            break;
          case 'enable':
            // ルールを省いた enable は、開いているものをすべて閉じる
            for (const [rule, from] of open) {
              if (id === ALL || rule === id) {
                ranges.push({ from, to: line, rule });
                open.delete(rule);
              }
            }
            break;
        }
      }
    }
  });
  for (const [rule, from] of open) ranges.push({ from, to: Infinity, rule });

  return (line, ruleId) => {
    const set = perLine.get(line);
    if (set && (set.has(ALL) || set.has(ruleId))) return true;
    return ranges.some((r) => line >= r.from && line < r.to && (r.rule === ALL || r.rule === ruleId));
  };
}

function parseRules(text: string): string[] {
  // 「-- 理由」以降と、コメントの閉じ記号を除く
  const body = text.split(/\s--\s/)[0]!.replace(/\*\/|-->|#}|%}/g, ' ');
  return body.split(/[\s,]+/).filter((token) => ruleMap.has(token));
}
