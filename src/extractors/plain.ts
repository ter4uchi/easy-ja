import { SegmentBuilder, type Segment } from '../text/segment.js';

/** テキストファイル全体を、空行で区切られた段落として扱う */
export function extractPlainText(source: string): Segment[] {
  const segments: Segment[] = [];
  new SegmentBuilder('text', true).add(source, 0).flush(segments);
  return segments;
}
