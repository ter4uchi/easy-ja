export interface Line {
  /** 改行を含まない行の文字列 */
  text: string;
  /** ソース上の行頭の位置 */
  start: number;
}

export function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const m of source.matchAll(/\r?\n/g)) {
    lines.push({ text: source.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  lines.push({ text: source.slice(start), start });
  return lines;
}
