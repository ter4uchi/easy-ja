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
  /** text[i] に対応する部分（エスケープなら \n や \u3042 全体）の、ソース上の終わりの位置 */
  ends: number[];
}

/**
 * バックスラッシュによるエスケープを解く。
 * JavaScript の規則に沿うが、C・Python・JSON などの文字列にもおおむね使える。
 */
export function decodeEscapes(raw: string, sourceStart: number): Decoded {
  let text = '';
  const offsets: number[] = [];
  const ends: number[] = [];
  const push = (str: string, at: number, length: number) => {
    text += str;
    for (let k = 0; k < str.length; k++) {
      offsets.push(at);
      ends.push(at + length);
    }
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    const at = sourceStart + i;
    if (ch !== '\\' || i + 1 >= raw.length) {
      push(ch, at, 1);
      i++;
      continue;
    }
    const next = raw[i + 1]!;
    const rest = raw.slice(i + 2);
    let m: RegExpExecArray | null;
    if (next in SIMPLE_ESCAPES) {
      push(SIMPLE_ESCAPES[next]!, at, 2);
      i += 2;
    } else if (next === 'u' && (m = /^\{([0-9a-fA-F]{1,6})\}/.exec(rest))) {
      push(safeFromCodePoint(parseInt(m[1]!, 16)), at, 2 + m[0].length);
      i += 2 + m[0].length;
    } else if (next === 'u' && (m = /^[0-9a-fA-F]{4}/.exec(rest))) {
      push(String.fromCharCode(parseInt(m[0], 16)), at, 6);
      i += 6;
    } else if (next === 'x' && (m = /^[0-9a-fA-F]{2}/.exec(rest))) {
      push(String.fromCharCode(parseInt(m[0], 16)), at, 4);
      i += 4;
    } else if (next === '\r' || next === '\n') {
      // 行継続
      i += next === '\r' && raw[i + 2] === '\n' ? 3 : 2;
    } else {
      push(next, at, 2);
      i += 2;
    }
  }
  return { text, offsets, ends };
}

function safeFromCodePoint(cp: number): string {
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
}
