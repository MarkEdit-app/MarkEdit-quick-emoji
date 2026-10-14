import { pickedCompletion } from '@codemirror/autocomplete';
import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { emoticon } from 'emoticon';
import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';

type Mapping = {
  emoticon: string;
  emoji: string;
  name: string;
};

const protectedNodes = new Set([
  'CodeBlock',
  'Comment',
  'CommentBlock',
  'FencedCode',
  'FrontMatter',
  'HTMLBlock',
  'HTMLTag',
  'InlineCode',
  'LinkMark',
  'LinkTitle',
  'ListMark',
  'QuoteMark',
  'TaskMarker',
  'URL',
]);

const tokenBoundary = /[\s.,!?;:()[\]{}'"`]/;
const wordStart = /^[\p{L}\p{N}_]/u;
const shortcode = /^:[\p{L}\p{N}_+-]+:$/u;
const urlPrefix = /(?:[a-z][a-z\d+.-]*:\/\/|(?:data|mailto|sms|tel|urn):|www\.)\S*$/i;
const emailPrefix = /\b[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createQuickEmojiCompletion(custom?: unknown): CompletionSource {
  const mappings = buildMappings(custom);
  const maxLength = Math.max(0, ...mappings.map(mapping => mapping.emoticon.length));

  const complete = (context: CompletionContext): CompletionResult | null => {
    const { state, pos, view } = context;
    const selection = state.selection.main;
    if (state.readOnly || !state.facet(EditorView.editable) || view?.composing
      || state.selection.ranges.length !== 1 || !selection.empty || selection.head !== pos) {
      return null;
    }

    const line = state.doc.lineAt(pos);
    if (pos !== line.to && !tokenBoundary.test(state.sliceDoc(pos, pos + 1))) {
      return null;
    }

    const start = Math.max(line.from, pos - maxLength);
    const prefix = state.sliceDoc(start, pos);
    let rejectedExact = false;
    for (let offset = 0; offset < prefix.length; offset++) {
      const query = prefix.slice(offset);
      const from = start + offset;
      const atSpaceBoundary = from === line.from || /\s/.test(state.sliceDoc(from - 1, from));
      if (/\s/.test(query) || (!context.explicit && query.length < 2
        && (wordStart.test(query) || !atSpaceBoundary))) {
        continue;
      }

      const atBoundary = from === line.from || tokenBoundary.test(state.sliceDoc(from - 1, from));
      const matches = mappings.filter(mapping => mapping.emoticon.startsWith(query));
      const candidates = matches.filter(mapping => (!rejectedExact || mapping.emoticon === query)
        && (atBoundary || !(wordStart.test(mapping.emoticon) || shortcode.test(mapping.emoticon))));
      if (candidates.length === 0) {
        rejectedExact ||= matches.some(mapping => mapping.emoticon === query);
        continue;
      }

      const linePrefix = state.sliceDoc(line.from, from);
      if (urlPrefix.test(linePrefix) || emailPrefix.test(linePrefix) || isProtectedSyntax(state, from, pos)) {
        return null;
      }

      const byEmoji = new Map<string, Mapping>();
      for (const mapping of candidates) {
        if (!byEmoji.has(mapping.emoji) || mapping.emoticon === query) {
          byEmoji.set(mapping.emoji, mapping);
        }
      }

      return {
        from,
        to: pos,
        filter: false,
        update: (_result, _from, _to, context) => complete(context),
        options: [...byEmoji.values()].sort((left, right) =>
          Number(right.emoticon === query) - Number(left.emoticon === query)).map(mapping => ({
          label: `${mapping.emoji} ${mapping.name.replace(/_/g, ' ')}`,
          detail: mapping.emoticon,
          type: 'emoji',
          apply: (editor, completion, from, to) => editor.dispatch({
            changes: { from, to, insert: mapping.emoji },
            selection: { anchor: from + mapping.emoji.length },
            annotations: [pickedCompletion.of(completion), isolateHistory.of('full')],
            userEvent: 'input.complete',
          }),
        })),
      };
    }

    return null;
  };

  return complete;
}

function buildMappings(custom: unknown): Mapping[] {
  const byEmoticon = new Map(emoticon
    .filter(entry => entry.name !== 'man')
    .flatMap(entry => entry.emoticons.map(value => [value, {
      emoticon: value,
      emoji: entry.emoji,
      name: entry.name,
    }] as const)));

  if (typeof custom === 'object' && custom !== null && !Array.isArray(custom)) {
    for (const [value, emoji] of Object.entries(custom)) {
      if (value.length > 0 && typeof emoji === 'string' && emoji.length > 0) {
        byEmoticon.set(value, {
          emoticon: value,
          emoji,
          name: emoticon.find(entry => entry.emoji === emoji)?.name ?? 'Custom emoji',
        });
      }
    }
  }

  return [...byEmoticon.values()];
}

function isProtectedSyntax(state: EditorState, from: number, to: number) {
  const tree = syntaxTree(state);
  for (const position of [from, to]) {
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
