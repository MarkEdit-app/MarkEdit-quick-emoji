import assert from 'node:assert/strict';
import test from 'node:test';
import { history, redo, undo } from '@codemirror/commands';
import { Language, defineLanguageFacet } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parser } from '@lezer/markdown';
import { createQuickEmoji } from '../src/quick-emoji.ts';
import type { Extension, Transaction } from '@codemirror/state';

const markdown = new Language(defineLanguageFacet(), parser, [], 'Markdown');
const quickEmoji = createQuickEmoji();

test('converts a typed emoticon as an isolated undo step', () => {
  const editor = typeText('Hello :', [7], ')');

  assert.equal(editor.handled, true);
  assert.equal(editor.text, 'Hello 😃');
  assert.equal(editor.undo(), true);
  assert.equal(editor.text, 'Hello :)');
  assert.equal(editor.redo(), true);
  assert.equal(editor.text, 'Hello 😃');
});

test('adds and overrides mappings from settings', () => {
  const extension = createQuickEmoji({ ':)': '🙂', ':-': '😶', ':wave:': '👋' });

  assert.equal(typeText('Hello :', [7], ')', 'input.type', [], extension).text, 'Hello 🙂');
  assert.equal(typeText('Hello :', [7], '-', 'input.type', [], extension).text, 'Hello 😶');
  assert.equal(typeText('Hello :wave', [11], ':', 'input.type', [], extension).text, 'Hello 👋');
  assert.equal(typeText('Hi:wave', [7], ':', 'input.type', [], extension).text, 'Hi:wave:');
});

test('avoids ambiguous and protected input', () => {
  assert.deepEqual(typeText('Hi:', [3], ')').result, [true, 'Hi😃']);
  assert.deepEqual(typeText('Helloo:', [7], ')').result, [true, 'Helloo😃']);
  assert.deepEqual(typeText('wordx', [5], ']').result, [false, 'wordx]']);
  assert.deepEqual(typeText('(:', [2], ')').result, [true, '(😃']);
  assert.deepEqual(typeText(':', [1], '-').result, [false, ':-']);
  assert.deepEqual(typeText('- [x', [4], ']').result, [false, '- [x]']);
  assert.deepEqual(typeText('- [X', [4], ']').result, [false, '- [X]']);
  assert.deepEqual(typeText('[8', [2], ']').result, [false, '[8]']);
  assert.deepEqual(typeText('[label :', [8], ']').result, [false, '[label :]']);
  assert.deepEqual(typeText('8', [1], ')').result, [false, '8)']);
  assert.deepEqual(typeText('> 8', [3], ')').result, [false, '> 8)']);
  assert.deepEqual(typeText('- 8', [3], ')', 'input.type', [markdown]).result, [false, '- 8)']);
  assert.deepEqual(typeText('1. 8', [4], ')', 'input.type', [markdown]).result, [false, '1. 8)']);
  assert.deepEqual(typeText('x', [1], ']').result, [true, '😆']);
  assert.deepEqual(typeText('[done] x', [8], ']').result, [true, '[done] 😆']);
  assert.deepEqual(typeText('Hello :', [7], ']').result, [true, 'Hello 😃']);
  assert.deepEqual(typeText('Number 8', [8], ')', 'input.type', [markdown]).result, [true, 'Number 😎']);
  assert.deepEqual(typeText('>:', [2], '(').result, [false, '>:(']);
  assert.deepEqual(typeText('> >:', [4], '(').result, [false, '> >:(']);
  assert.deepEqual(typeText('Angry >:', [8], '(').result, [true, 'Angry 😠']);
  assert.deepEqual(typeText(' ', [1], ':)', 'input.paste').result, [false, ' :)']);
  assert.deepEqual(typeText('https://x/:', [11], ')').result, [false, 'https://x/:)']);
  assert.deepEqual(typeText('ftp://x/:', [9], ')').result, [false, 'ftp://x/:)']);
  assert.deepEqual(typeText('mailto:a@b.com:', [15], ')').result, [false, 'mailto:a@b.com:)']);
  assert.deepEqual(typeText('a@b.com:', [8], ')').result, [false, 'a@b.com:)']);
  assert.deepEqual(typeText('`Hi:', [4], ')', 'input.type', [markdown]).result, [false, '`Hi:)']);
  assert.deepEqual(typeText('``Hi:', [5], ')', 'input.type', [markdown]).result, [false, '``Hi:)']);
  assert.deepEqual(typeText('<span title="Hi:', [16], ')', 'input.type', [markdown]).result,
    [false, '<span title="Hi:)']);
  assert.deepEqual(typeText('\\`Hi:', [5], ')', 'input.type', [markdown]).result, [true, '\\`Hi😃']);
  assert.deepEqual(typeText('1 < 2 Hi:', [9], ')', 'input.type', [markdown]).result, [true, '1 < 2 Hi😃']);
  assert.deepEqual(typeText('` :`', [3], ')', 'input.type', [markdown]).result, [false, '` :)`']);
  assert.deepEqual(typeText('```\n:\n```', [5], ')', 'input.type', [markdown]).result, [false, '```\n:)\n```']);
  assert.deepEqual(typeText('[x](https://x/:)', [15], ')', 'input.type', [markdown]).result,
    [false, '[x](https://x/:))']);
  assert.deepEqual(typeText('<i title=":">', [11], ')', 'input.type', [markdown]).result,
    [false, '<i title=":)">']);
});

test('converts multiple cursors in one undo step', () => {
  const editor = typeText(': :', [1, 3], ')');

  assert.equal(editor.text, '😃 😃');
  assert.equal(editor.undo(), true);
  assert.equal(editor.text, ':) :)');
});

function typeText(
  document: string,
  positions: number[],
  inserted: string,
  userEvent = 'input.type',
  extensions: Extension[] = [],
  emojiExtension: Extension = quickEmoji,
) {
  let state = EditorState.create({
    doc: document,
    selection: EditorSelection.create(positions.map(position => EditorSelection.cursor(position))),
    extensions: [EditorState.allowMultipleSelections.of(true), history(), emojiExtension, ...extensions],
  });
  const inputSpec = state.changeByRange(range => ({
    changes: { from: range.from, to: range.to, insert: inserted },
    range: EditorSelection.cursor(range.from + inserted.length),
  }));
  const input = state.update({ ...inputSpec, userEvent });
  const handler = state.facet(EditorView.inputHandler)[0];
  const view = {
    get state() {
      return state;
    },
    dispatch(value: Transaction | readonly Transaction[]) {
      const transactions = Array.isArray(value) ? value : [value];
      state = transactions[transactions.length - 1].state;
    },
  } as EditorView;

  const handled = handler(view, positions[0], positions[0], inserted, () => input);
  if (!handled) {
    state = input.state;
  }

  return {
    handled,
    get text() {
      return state.doc.toString();
    },
    get result() {
      return [handled, state.doc.toString()];
    },
    undo() {
      return undo({ state, dispatch: transaction => { state = transaction.state; } });
    },
    redo() {
      return redo({ state, dispatch: transaction => { state = transaction.state; } });
    },
  };
}
