import { parse, type ParserPlugin } from '@babel/parser';
import type * as t from '@babel/types';
import { decodeEscapes } from '../text/escape.js';
import { SegmentBuilder, rawSegment, type Segment } from '../text/segment.js';
import { commentSegments } from './comments.js';
import type { ExtractOptions } from './types.js';

export type ScriptLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

export interface JavaScriptOptions extends ExtractOptions {
  language: ScriptLanguage;
  /** Vue などの中にあるスクリプトを調べるとき、その開始位置 */
  baseOffset?: number;
}

const PLUGINS: Record<ScriptLanguage, ParserPlugin[]> = {
  js: ['jsx', 'decorators-legacy'],
  jsx: ['jsx', 'decorators-legacy'],
  ts: ['typescript', 'decorators-legacy'],
  tsx: ['typescript', 'jsx', 'decorators-legacy'],
};

const SKIP_KEYS = new Set([
  'type', 'start', 'end', 'loc', 'range', 'extra',
  'leadingComments', 'trailingComments', 'innerComments',
]);

// 文の途中に置かれる要素。これ以外の要素は文の区切りとみなす
const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark',
  'q', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);
// 中身を読まない要素（ルビの読みがななど）
const SKIP_ELEMENTS = new Set(['rt', 'rp', 'script', 'style']);

type AnyNode = t.Node & Record<string, unknown>;

export function extractJavaScript(source: string, options: JavaScriptOptions): Segment[] {
  const base = options.baseOffset ?? 0;
  const ast = parse(source, {
    sourceType: 'unambiguous',
    plugins: PLUGINS[options.language],
    errorRecovery: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowUndeclaredExports: true,
  });
  const segments: Segment[] = [];

  const push = (segment: Segment | null) => {
    if (segment) segments.push(segment);
  };

  const decoded = (start: number, end: number) => decodeEscapes(source.slice(start, end), base + start);

  const addStringLiteral = (node: t.StringLiteral) => {
    const d = decoded(node.start! + 1, node.end! - 1);
    const out: Segment[] = [];
    new SegmentBuilder('string', false).addMapped(d.text, d.offsets, d.ends).flush(out);
    segments.push(...out);
  };

  const addTemplate = (node: t.TemplateLiteral) => {
    const builder = new SegmentBuilder('template', false);
    node.quasis.forEach((quasi, i) => {
      const d = decoded(quasi.start!, quasi.end!);
      builder.addMapped(d.text, d.offsets, d.ends);
      const expression = node.expressions[i];
      // `${` から `}` まで。次の quasi はその直後から始まる
      if (expression) builder.placeholder(base + quasi.end!, base + node.quasis[i + 1]!.start!);
    });
    builder.flush(segments);
    node.expressions.forEach((e) => visit(e));
  };

  const visitAttributes = (attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]) => {
    for (const attribute of attributes) {
      if (attribute.type === 'JSXSpreadAttribute') {
        visit(attribute.argument);
      } else if (attribute.value?.type === 'StringLiteral') {
        // JSX の属性値ではバックスラッシュのエスケープは効かない
        const v = attribute.value;
        push(rawSegment('attribute', source.slice(v.start! + 1, v.end! - 1), base + v.start! + 1));
      } else if (attribute.value) {
        visit(attribute.value);
      }
    }
  };

  const handleJsx = (root: t.JSXElement | t.JSXFragment) => {
    const builder = new SegmentBuilder('jsx-text', true);

    const walkChildren = (children: t.JSXElement['children']) => {
      for (const child of children) {
        switch (child.type) {
          case 'JSXText':
            builder.add(source.slice(child.start!, child.end!), base + child.start!);
            break;
          case 'JSXExpressionContainer': {
            const e = child.expression;
            if (e.type === 'JSXEmptyExpression') break;
            if (e.type === 'StringLiteral') {
              const d = decoded(e.start! + 1, e.end! - 1);
              builder.addMapped(d.text, d.offsets, d.ends);
            } else if (e.type === 'TemplateLiteral' && e.expressions.length === 0) {
              const quasi = e.quasis[0]!;
              const d = decoded(quasi.start!, quasi.end!);
              builder.addMapped(d.text, d.offsets, d.ends);
            } else {
              builder.placeholder(base + child.start!, base + child.end!);
              visit(e);
            }
            break;
          }
          case 'JSXFragment':
            walkChildren(child.children);
            break;
          case 'JSXElement': {
            const name = elementName(child.openingElement.name);
            if (!SKIP_ELEMENTS.has(name) && !INLINE_ELEMENTS.has(name)) {
              // 文の区切りになる要素。属性は handleJsx の中で調べる
              builder.flush(segments);
              handleJsx(child);
              break;
            }
            visitAttributes(child.openingElement.attributes);
            if (SKIP_ELEMENTS.has(name)) break;
            const start = builder.length;
            walkChildren(child.children);
            if (name === 'ruby') builder.markRuby(start);
            break;
          }
          case 'JSXSpreadChild':
            builder.placeholder(base + child.start!, base + child.end!);
            visit(child.expression);
            break;
        }
      }
    };

    if (root.type === 'JSXElement') {
      visitAttributes(root.openingElement.attributes);
      if (SKIP_ELEMENTS.has(elementName(root.openingElement.name))) return;
    }
    walkChildren(root.children);
    builder.flush(segments);
  };

  const visit = (node: t.Node | null | undefined): void => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'Directive':
      case 'TSImportType':
      case 'TSExternalModuleReference':
        return;
      case 'ExportNamedDeclaration':
        visit(node.declaration);
        return;
      case 'StringLiteral':
        addStringLiteral(node);
        return;
      case 'TemplateLiteral':
        addTemplate(node);
        return;
      case 'JSXElement':
      case 'JSXFragment':
        handleJsx(node);
        return;
    }
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = (node as AnyNode)[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child);
      } else if (isNode(value)) {
        visit(value);
      }
    }
  };

  visit(ast.program);

  if (options.comments && ast.comments) {
    const raw = ast.comments.map((c) => ({
      block: c.type === 'CommentBlock',
      start: c.start!,
      end: c.end!,
      valueStart: c.start! + 2,
      valueEnd: c.type === 'CommentBlock' ? c.end! - 2 : c.end!,
    }));
    segments.push(...commentSegments(source, raw, base));
  }
  return segments;
}

function isNode(value: unknown): value is t.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function elementName(name: t.JSXOpeningElement['name']): string {
  switch (name.type) {
    case 'JSXIdentifier':
      return name.name;
    case 'JSXNamespacedName':
      return `${name.namespace.name}:${name.name.name}`;
    case 'JSXMemberExpression':
      return `${elementName(name.object)}.${name.property.name}`;
  }
}
