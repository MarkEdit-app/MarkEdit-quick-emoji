# MarkEdit-quick-emoji

Suggests emoji as you type emoticons like `:)` or `Hi:)`, using MarkEdit's
autocomplete dropdown. Choose a suggestion to replace the emoticon, or dismiss
the list to keep your text. <kbd>Command-Z</kbd> undoes an accepted suggestion.

Suggestions are hidden in parsed code, HTML, front matter, and URLs. Incomplete
Markdown may still show suggestions.

## Installation

Install this extension from the [MarkEdit Extension Registry](https://markedit-app.github.io/extensions/#markedit-quick-emoji).

## Building

```
yarn install
yarn test
yarn build
```

`yarn build` also deploys the extension to your local MarkEdit installation.

## Custom mappings

Set `extension.markeditQuickEmoji.mappings` in MarkEdit's `settings.json`.
Custom entries override bundled mappings and appear in the suggestion list.

```json
{
  "extension.markeditQuickEmoji": {
    "mappings": {
      ":)": "😊",
      ":wave:": "👋"
    }
  }
}
```

Restart MarkEdit after changing the file.

## Acknowledgments

Mappings come from [emoticon](https://github.com/wooorm/emoticon), available
under the [MIT License](https://github.com/wooorm/emoticon/blob/main/license).
