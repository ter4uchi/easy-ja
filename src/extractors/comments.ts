import { SegmentBuilder, type Segment } from '../text/segment.js';

export interface RawComment {
  block: boolean;
  /** コメント全体の範囲 */
  start: number;
  end: number;
  /** 記号（// や /* など）を除いた本文の範囲 */
  valueStart: number;
  valueEnd: number;
}

/**
 * コメントをセグメントにする。隣り合う行コメントはひとつの段落としてまとめる。
 */
export function commentSegments(source: string, comments: readonly RawComment[], baseOffset = 0): Segment[] {
  const out: Segment[] = [];
  let builder = new SegmentBuilder('comment', true);
  let previous: RawComment | undefined;

  for (const comment of comments) {
    const adjacent =
      previous && !previous.block && !comment.block && /^[ \t]*\r?\n[ \t]*$/.test(source.slice(previous.end, comment.start));
    if (!adjacent) builder.flush(out);
    else builder.add('\n', baseOffset + previous!.end);

    const value = source.slice(comment.valueStart, comment.valueEnd);
    if (!comment.block) {
      builder.add(value, baseOffset + comment.valueStart);
    } else {
      // 各行の先頭の「*」を取り除く
      let lineStart = comment.valueStart;
      for (const line of value.split('\n')) {
        const prefix = /^\s*\*?\s?/.exec(line)![0].length;
        builder.add(line.slice(prefix), baseOffset + lineStart + prefix).add('\n', baseOffset + lineStart + line.length);
        lineStart += line.length + 1;
      }
      builder.flush(out);
    }
    previous = comment;
  }
  builder.flush(out);
  return out;
}
