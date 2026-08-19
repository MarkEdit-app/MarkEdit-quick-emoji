import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { emoticon } from 'emoticon';
import type { EditorState, SelectionRange } from '@codemirror/state';

type Mapping = {
  emoticon: string;
  emoji: string;
};

type MappingIndex = {
  byEnd: Map<string, Mapping[]>;
  maxLength: number;
};

const protectedNodes = new Set([
  'CodeBlock',
  'Comment',
  'FencedCode',
  'FrontMatter',
  'HTMLBlock',
  'HTMLTag',
  'InlineCode',
  'ListMark',
  'LinkTitle',
  'URL',
]);

const tokenBoundary = /[\s.,!?;:()[\]{}'"`]/;
const wordStart = /^[\p{L}\p{N}_]/u;
const shortcode = /^:[\p{L}\p{N}_+-]+:$/u;
const urlPrefix = /(?:[a-z][a-z\d+.-]*:\/\/|(?:data|mailto|sms|tel|urn):|www\.)\S*$/i;
const emailPrefix = /\b[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createQuickEmoji(custom?: unknown) {
  const index = buildIndex(custom);

  return EditorView.inputHandler.of((view, _from, _to, _text, insert) => {
    const input = insert();
    if (!input.docChanged || !input.isUserEvent('input.type') || input.isUserEvent('input.type.compose')) {
      return false;
    }

    const inputEnds = new Set<number>();
    input.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
      if (inserted.length > 0) {
        inputEnds.add(toB);
      }
    });

    const replacements = input.state.changeByRange(range => replacementForRange(
      input.state,
      range,
      inputEnds,
      index,
    ));

    if (replacements.changes.empty) {
      return false;
    }

    const replacement = input.state.update({
      ...replacements,
      annotations: [Transaction.addToHistory.of(true), isolateHistory.of('full')],
      userEvent: 'input.type',
    });

    view.dispatch([input, replacement]);
    return true;
  });
}

function buildIndex(custom: unknown): MappingIndex {
  const byEmoticon = new Map(emoticon
    .filter(entry => entry.name !== 'man')
    .flatMap(entry => entry.emoticons.map(value => [value, entry.emoji] as const)));
  const byEnd = new Map<string, Mapping[]>();
  const customKeys = new Set<string>();

  if (typeof custom === 'object' && custom !== null && !Array.isArray(custom)) {
    for (const [value, emoji] of Object.entries(custom)) {
      if (value.length > 0 && typeof emoji === 'string' && emoji.length > 0) {
        byEmoticon.set(value, emoji);
        customKeys.add(value);
      }
    }
  }

  const allMappings = Array.from(byEmoticon, ([emoticon, emoji]) => ({ emoticon, emoji }));
  const filteredMappings = allMappings.filter(mapping => customKeys.has(mapping.emoticon) || !allMappings.some(candidate =>
    candidate.emoticon.length > mapping.emoticon.length && candidate.emoticon.startsWith(mapping.emoticon)
  ));

  for (const mapping of filteredMappings) {
    const lastChar = mapping.emoticon[mapping.emoticon.length - 1];
    const candidates = byEnd.get(lastChar) ?? [];
    candidates.push(mapping);
    candidates.sort((left, right) => right.emoticon.length - left.emoticon.length);
    byEnd.set(lastChar, candidates);
  }

  return {
    byEnd,
    maxLength: Math.max(...filteredMappings.map(mapping => mapping.emoticon.length)),
  };
}

function replacementForRange(
  state: EditorState,
  range: SelectionRange,
  inputEnds: Set<number>,
  index: MappingIndex,
) {
  if (!range.empty || !inputEnds.has(range.head)) {
    return { range };
  }

  const mapping = findMapping(state, range.head, index);
  if (mapping === undefined) {
    return { range };
  }

  const from = range.head - mapping.emoticon.length;
  return {
    changes: { from, to: range.head, insert: mapping.emoji },
    range: EditorSelection.cursor(from + mapping.emoji.length),
  };
}

function findMapping(
  state: EditorState,
  position: number,
  index: MappingIndex,
) {
  const line = state.doc.lineAt(position);
  const prefix = state.sliceDoc(Math.max(line.from, position - index.maxLength), position);
  const candidates = index.byEnd.get(prefix[prefix.length - 1]) ?? [];

  for (const mapping of candidates) {
    if (!prefix.endsWith(mapping.emoticon)) {
      continue;
    }

    const from = position - mapping.emoticon.length;
    if (conflictsWithMarkdown(state, from, mapping)
      || isProtectedContext(state, from, position)) {
      return undefined;
    }

    if (hasTokenBoundaries(state, from, position, mapping)) {
      return mapping;
    }
  }

  return undefined;
}

function conflictsWithMarkdown(state: EditorState, from: number, mapping: Mapping) {
  const line = state.doc.lineAt(from);
  const linePrefix = state.sliceDoc(line.from, from);
  if (mapping.emoticon.endsWith(']') && hasOpenBracket(linePrefix)) {
    return true;
  }

  const atBlockMarker = /^\s*(?:>\s*)*$/.test(linePrefix);
  return atBlockMarker && (mapping.emoticon === '8)' || mapping.emoticon.startsWith('>'));
}

function hasOpenBracket(text: string) {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\') {
      index++;
    } else if (text[index] === '[') {
      depth++;
    } else if (text[index] === ']' && depth > 0) {
      depth--;
    }
  }

  return depth > 0;
}

function hasTokenBoundaries(state: EditorState, from: number, to: number, mapping: Mapping) {
  const line = state.doc.lineAt(from);
  const needsStart = wordStart.test(mapping.emoticon) || shortcode.test(mapping.emoticon);
  const starts = !needsStart || from === line.from || tokenBoundary.test(state.sliceDoc(from - 1, from));
  const ends = to === line.to || tokenBoundary.test(state.sliceDoc(to, to + 1));
  return starts && ends;
}

function isProtectedContext(state: EditorState, from: number, to: number) {
  const line = state.doc.lineAt(from);
  const linePrefix = state.sliceDoc(line.from, from);
  return urlPrefix.test(linePrefix)
    || emailPrefix.test(linePrefix)
    || hasOpenCodeSpan(linePrefix)
    || hasOpenHtmlTag(linePrefix)
    || isProtectedSyntax(state, from, to);
}

function hasOpenCodeSpan(text: string) {
  let delimiter = 0;
  for (let index = 0; index < text.length;) {
    if (text[index] !== '`' || (delimiter === 0 && isEscaped(text, index))) {
      index++;
      continue;
    }

    let end = index + 1;
    while (text[end] === '`') {
      end++;
    }

    const length = end - index;
    if (delimiter === 0) {
      delimiter = length;
    } else if (delimiter === length) {
      delimiter = 0;
    }

    index = end;
  }

  return delimiter > 0;
}

function hasOpenHtmlTag(text: string) {
  let open = text.lastIndexOf('<');
  while (open >= 0 && isEscaped(text, open)) {
    open = text.lastIndexOf('<', open - 1);
  }

  return open > text.lastIndexOf('>')
    && /^(?:<\/?[a-z][a-z\d-]*(?:\s|\/|$)|<!--|<![A-Z]|<\?)/i.test(text.slice(open));
}

function isEscaped(text: string, position: number) {
  let slashes = 0;
  while (position > slashes && text[position - slashes - 1] === '\\') {
    slashes++;
  }

  return slashes % 2 === 1;
}

function isProtectedSyntax(state: EditorState, from: number, to: number) {
  const tree = syntaxTree(state);
  for (const position of [from, Math.max(from, to - 1)]) {
    let node = tree.resolveInner(position, position === from ? 1 : -1);
    while (true) {
      if (protectedNodes.has(node.name)) {
        return true;
      }

      if (node.parent === null) {
        break;
      }

      node = node.parent;
    }
  }

  return false;
}
