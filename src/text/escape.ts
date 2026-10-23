const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

export interface Decoded {
  text: string;
  /** text[i] に対応するソース上の位置 */
  offsets: number[];
}

/**
 * バックスラッシュによるエスケープを解く。
 * JavaScript の規則に沿うが、C・Python・JSON などの文字列にもおおむね使える。
 */
export function decodeEscapes(raw: string, sourceStart: number): Decoded {
  let text = '';
  const offsets: number[] = [];
  const push = (str: string, at: number) => {
    text += str;
    for (let k = 0; k < str.length; k++) offsets.push(at);
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    const at = sourceStart + i;
    if (ch !== '\\' || i + 1 >= raw.length) {
      push(ch, at);
      i++;
      continue;
    }
    const next = raw[i + 1]!;
    const rest = raw.slice(i + 2);
    let m: RegExpExecArray | null;
    if (next in SIMPLE_ESCAPES) {
      push(SIMPLE_ESCAPES[next]!, at);
      i += 2;
    } else if (next === 'u' && (m = /^\{([0-9a-fA-F]{1,6})\}/.exec(rest))) {
      push(safeFromCodePoint(parseInt(m[1]!, 16)), at);
      i += 2 + m[0].length;
    } else if (next === 'u' && (m = /^[0-9a-fA-F]{4}/.exec(rest))) {
      push(String.fromCharCode(parseInt(m[0], 16)), at);
      i += 6;
    } else if (next === 'x' && (m = /^[0-9a-fA-F]{2}/.exec(rest))) {
      push(String.fromCharCode(parseInt(m[0], 16)), at);
      i += 4;
    } else if (next === '\r' || next === '\n') {
      // 行継続
      i += next === '\r' && raw[i + 2] === '\n' ? 3 : 2;
    } else {
      push(next, at);
      i += 2;
    }
  }
  return { text, offsets };
}

function safeFromCodePoint(cp: number): string {
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
}
