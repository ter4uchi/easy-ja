const CODES = {
  red: [31, 39],
  yellow: [33, 39],
  green: [32, 39],
  gray: [90, 39],
  bold: [1, 22],
  underline: [4, 24],
} as const;

export type Colors = Record<keyof typeof CODES, (text: string) => string>;

export function createColors(enabled: boolean): Colors {
  return Object.fromEntries(
    Object.entries(CODES).map(([name, [open, close]]) => [
      name,
      (text: string) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text),
    ]),
  ) as Colors;
}
