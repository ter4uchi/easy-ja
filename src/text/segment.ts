import { OBJ, hasJapanese } from './chars.js';

export type SegmentKind =
  | 'string'
  | 'template'
  | 'jsx-text'
  | 'markup-text'
  | 'attribute'
  | 'comment'
  | 'text';

/** ソースコードから取り出した、ひとまとまりの文章 */
export interface Segment {
  kind: SegmentKind;
  text: string;
  /** text[i] に対応するソース上の位置。長さは text.length + 1 で、最後の要素は終端位置 */
  offsets: number[];
  /** true のとき、単独の改行を文の区切りとして扱わない（HTML・JSX・段落テキストなど） */
  flow: boolean;
  /** <ruby> でルビがふられている範囲（text 上の [開始, 終了)） */
  ruby?: [start: number, end: number][];
}

export class SegmentBuilder {
  private text = '';
  private offsets: number[] = [];
  private ruby: [number, number][] = [];

  constructor(
    private readonly kind: SegmentKind,
    private readonly flow: boolean,
  ) {}

  get isEmpty(): boolean {
    return this.text.length === 0;
  }

  get length(): number {
    return this.text.length;
  }

  /** start から今の末尾までを、ルビのふられた範囲として記録する */
  markRuby(start: number): this {
    if (start < this.text.length) this.ruby.push([start, this.text.length]);
    return this;
  }

  /** ソースと1文字ずつ対応する文字列を追加する */
  add(str: string, sourceStart: number): this {
    for (let i = 0; i < str.length; i++) this.offsets.push(sourceStart + i);
    this.text += str;
    return this;
  }

  /** エスケープを解いた文字列など、位置を個別に指定して追加する */
  addMapped(str: string, offsets: readonly number[]): this {
    for (let i = 0; i < str.length; i++) this.offsets.push(offsets[i] ?? offsets.at(-1) ?? 0);
    this.text += str;
    return this;
  }

  /** 埋め込み式を1文字の代替文字として追加する */
  placeholder(sourceOffset: number): this {
    this.text += OBJ;
    this.offsets.push(sourceOffset);
    return this;
  }

  /** 日本語を含む場合だけ out に追加し、ビルダーを空にする */
  flush(out: Segment[]): void {
    if (hasJapanese(this.text)) {
      const end = (this.offsets.at(-1) ?? 0) + 1;
      const segment: Segment = { kind: this.kind, text: this.text, offsets: [...this.offsets, end], flow: this.flow };
      if (this.ruby.length) segment.ruby = this.ruby;
      out.push(segment);
    }
    this.text = '';
    this.offsets = [];
    this.ruby = [];
  }
}

/** ソース上で連続する文字列からセグメントを1つ作る */
export function rawSegment(kind: SegmentKind, text: string, sourceStart: number, flow = false): Segment | null {
  if (!hasJapanese(text)) return null;
  const out: Segment[] = [];
  new SegmentBuilder(kind, flow).add(text, sourceStart).flush(out);
  return out[0] ?? null;
}

// `{name}`・`{{ name }}`・`${name}`・`#{name}`・`%s`・`%1$s`・`%@` など、実行時に置き換わる部分
const PLACEHOLDER_RE =
  /\$\{[^{}\n]{0,80}\}|#\{[^{}\n]{0,80}\}|\{\{[^{}\n]{0,80}\}\}|\{[^{}\n]{0,80}\}|%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?[sdifuxXoeEgGc@]/g;

/** プレースホルダーを1文字の代替文字にまとめる（文字数を正しく数えるため） */
export function collapsePlaceholders(segment: Segment): Segment {
  if (!/[{%]/.test(segment.text)) return segment;
  let text = '';
  const offsets: number[] = [];
  // 元の text 上の位置 → 新しい text 上の位置（ルビの範囲を直すため）
  const moved: number[] = [];
  let last = 0;
  const keep = (to: number) => {
    for (let i = last; i < to; i++) {
      moved[i] = offsets.length;
      offsets.push(segment.offsets[i]!);
    }
    text += segment.text.slice(last, to);
  };
  for (const m of segment.text.matchAll(PLACEHOLDER_RE)) {
    keep(m.index);
    for (let i = m.index; i < m.index + m[0].length; i++) moved[i] = offsets.length;
    text += OBJ;
    offsets.push(segment.offsets[m.index]!);
    last = m.index + m[0].length;
  }
  if (last === 0) return segment;
  keep(segment.text.length);
  moved[segment.text.length] = offsets.length;
  offsets.push(segment.offsets.at(-1)!);

  const result: Segment = { ...segment, text, offsets };
  if (segment.ruby) result.ruby = segment.ruby.map(([start, end]) => [moved[start]!, moved[end]!]);
  return result;
}
