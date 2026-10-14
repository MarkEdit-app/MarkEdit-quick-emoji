import assert from 'node:assert/strict';
import test from 'node:test';
import { CompletionContext, pickedCompletion } from '@codemirror/autocomplete';
import { history, redo, undo } from '@codemirror/commands';
import { markdownLanguage as markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createQuickEmojiCompletion } from '../src/quick-emoji.ts';
import type { CompletionResult } from '@codemirror/autocomplete';
import type { Extension, Transaction, TransactionSpec } from '@codemirror/state';

test('registers alongside other Markdown completion sources', () => {
  const source = createQuickEmojiCompletion();
  const otherSource = () => null;
  const state = makeState(':', 1, [
    markdown.data.of({ autocomplete: source }),
    markdown.data.of({ autocomplete: otherSource }),
  ]);
  assert.deepEqual(state.languageDataAt('autocomplete', 1), [source, otherSource]);
  assert.equal(state.facet(EditorView.inputHandler).length, 0);
});

test('suggests without changing text and replaces only on acceptance', () => {
  let state = EditorState.create({ doc: 'Hi:', extensions: [history(), markdown] });
  state = state.update({
    changes: { from: 3, insert: ')' },
    selection: { anchor: 4 },
    userEvent: 'input.type',
  }).state;
  const result = complete(state);
  assert.ok(result);
  assert.equal(state.doc.toString(), 'Hi:)');
  assert.equal(result.from, 2);
  assert.equal(result.to, 4);
  const option = result.options.find(option => option.label.startsWith('😃 '));
  assert.ok(option);
  assert.equal(typeof option.apply, 'function');
  let accepted: Transaction | undefined;
  const view = {
    get state() { return state; },
    dispatch(spec: TransactionSpec) {
      accepted = state.update(spec);
      state = accepted.state;
    },
  } as EditorView;
  if (typeof option.apply === 'function') {
    option.apply(view, option, result.from, result.to!);
  }
  assert.equal(state.doc.toString(), 'Hi😃');
  assert.equal(state.selection.main.head, 4);
  assert.equal(accepted?.annotation(pickedCompletion), option);
  assert.equal(undo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), 'Hi:)');
  assert.equal(redo({ state, dispatch: transaction => { state = transaction.state; } }), true);
  assert.equal(state.doc.toString(), 'Hi😃');
});

test('offers a filtered list with names and keeps longer emoticons available', () => {
  const result = suggest(':');
  assert.ok(result);
  assert.ok(result.options.length > 1);
  assert.equal(new Set(result.options.map(option => option.label)).size, result.options.length);
  assert.ok(result.options.every(option => option.type === 'emoji' && option.detail?.startsWith(':')));
  assert.ok(suggest(':-')?.options.some(option => option.detail === ':-'));
  assert.ok(suggest(':-)')?.options.some(option => option.detail === ':-)'));
  assert.equal(suggest('Hello:)')?.from, 5);
  assert.equal(suggest('wordx]'), null);
  assert.equal(suggest('B'), null);
  assert.equal(suggest('ordinary text'), null);
});

test('offers standalone punctuation but suppresses single-character prefixes within words', () => {
  for (const text of [':', ' :', 'Hi :', 'Hi\t:', 'Hello\n:', '=', ';']) {
    const result = suggest(text);
    assert.ok(result, text);
    assert.equal(result.from, text.length - 1, text);
    assert.ok(result.options.length > 0, text);
  }

  for (const text of ['Note:', 'Hi:', 'foo=', 'https:', 'B', ' B', '12:', 'word;']) {
    assert.equal(suggest(text), null, text);
  }

  const result = complete(makeState('Note:'), undefined, true);
  assert.ok(result);
  assert.equal(result.from, 4);
  assert.ok(result.options.length > 1);
});

test('adds and overrides custom mappings', () => {
  const custom = { ':)': '🙂', ':wave:': '👋', empty: '', invalid: 123 };
  assert.ok(suggest('Hi:)', custom)?.options.some(option => option.label.startsWith('🙂 ')));
  assert.ok(!suggest('Hi:)', custom)?.options.some(option => option.label.startsWith('😃 ')));
  assert.ok(suggest(':wa', custom)?.options.some(option => option.detail === ':wave:'));
  assert.equal(suggest('Hi:wave:', custom), null);
  assert.ok(suggest(':)', []));
});

test('suppresses suggestions in structured contexts', () => {
  for (const text of ['https://x/:)', 'ftp://x/:)', 'a@b.com:)', '8)', '- 8)', '>:(', '```\nHi:)']) {
    assert.equal(suggest(text), null, text);
  }
  for (const [text, position] of [
    ['`Hi:)`', 5],
    ['`:`', 2],
    ['<span title="Hi:)">', 16],
    ['[x](https://x/:))', 16],
  ] as const) {
    assert.equal(complete(makeState(text, position)), null, text);
  }
});

test('suppresses suggestions in task markers but allows task text', () => {
  for (const text of ['- [x]', '- [X]', '- [x] ', '- [x] done', '1. [x] done']) {
    const state = makeState(text, text.indexOf(']') + 1);
    assert.equal(complete(state), null, text);
    assert.equal(complete(state, undefined, true), null, text);
  }

  assert.ok(suggest('x]'));
  assert.ok(suggest('- [x] Hi:)'));
});

test('rechecks context on completion updates', () => {
  const result = suggest(':');
  assert.ok(result?.update);
  const state = makeState(':-)');
  const updated = result.update(result, 0, 3, new CompletionContext(state, 3, false));
  assert.ok(updated?.options.some(option => option.detail === ':-)'));
  const shortened = makeState(':');
  assert.ok(result.update(result, 0, 1, new CompletionContext(shortened, 1, false)));
  const attached = makeState('Note:');
  assert.equal(result.update(result, 4, 5, new CompletionContext(attached, 5, false)), null);
  const prose = makeState(':)text');
  assert.equal(result.update(result, 0, 2, new CompletionContext(prose, 2, false)), null);
});

test('does not offer completions for read-only editors or multiple selections', () => {
  assert.equal(complete(makeState(':)', 2, [EditorState.readOnly.of(true)])), null);
  assert.equal(complete(makeState(':)', 2, [EditorView.editable.of(false)])), null);
  const state = EditorState.create({
    doc: ':) :)',
    selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(5)]),
    extensions: [EditorState.allowMultipleSelections.of(true), markdown],
  });
  assert.equal(complete(state), null);
  assert.equal(complete(state.update({ selection: { anchor: 0, head: 2 } }).state), null);
});

function makeState(doc: string, position = doc.length, extensions: Extension[] = []) {
  return EditorState.create({ doc, selection: { anchor: position }, extensions: [markdown, ...extensions] });
}

function complete(state: EditorState, custom?: unknown, explicit = false) {
  return createQuickEmojiCompletion(custom)(new CompletionContext(state, state.selection.main.head, explicit)) as CompletionResult | null;
}

function suggest(doc: string, custom?: unknown) {
  return complete(makeState(doc), custom);
}
