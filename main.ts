import { MarkEdit } from 'markedit-api';
import { createQuickEmoji } from './src/quick-emoji';

const settings = MarkEdit.userSettings['extension.markeditQuickEmoji'];
const mappings = typeof settings === 'object' && settings !== null && !Array.isArray(settings)
  ? settings['mappings']
  : undefined;

MarkEdit.addExtension(createQuickEmoji(mappings));
