import { EditorView } from '@codemirror/view';
import { MarkEdit } from 'markedit-api';
import { createQuickEmojiCompletion } from './src/quick-emoji';

const settings = MarkEdit.userSettings['extension.markeditQuickEmoji'];
const mappings = typeof settings === 'object' && settings !== null && !Array.isArray(settings)
  ? settings['mappings']
  : undefined;

MarkEdit.addExtension([
  MarkEdit.codemirror.langMarkdown.markdownLanguage.data.of({
    autocomplete: createQuickEmojiCompletion(mappings),
  }),
  MarkEdit.codemirror.autocomplete.autocompletion({
    optionClass: option => option.type === 'emoji' ? 'qe-emoji-completion' : '',
  }),
  EditorView.theme({
    '.cm-tooltip-autocomplete > ul:has(> .qe-emoji-completion):not(:has(> li:not(.qe-emoji-completion)))': {
      minWidth: '0',
    },
    '.qe-emoji-completion .cm-completionIcon': {
      display: 'none',
    },
    '.qe-emoji-completion .cm-completionDetail': {
      fontStyle: 'normal',
    },
  }),
]);
