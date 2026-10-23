import type { Segment } from '../text/segment.js';

export interface ExtractOptions {
  /** コメントも調べるか */
  comments: boolean;
}

export type Extractor = (source: string, options: ExtractOptions) => Segment[];
