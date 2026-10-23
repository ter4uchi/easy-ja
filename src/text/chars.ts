/** 埋め込み式（`${name}` など）や許可語を表す代替文字。どの規則にも一致しない。 */
export const OBJ = '￼';

const JAPANESE_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const KANJI_RE = /^\p{Script=Han}$/u;

export function hasJapanese(text: string): boolean {
  return JAPANESE_RE.test(text);
}

export function isKanji(ch: string): boolean {
  return KANJI_RE.test(ch);
}

/** カタカナをひらがなに変換する（長音記号などはそのまま） */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 全角数字を半角数字に変換する */
export function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
