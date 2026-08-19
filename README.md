# MarkEdit-quick-emoji

Silently converts emoticons like `:)` to 😃 as you type. Pasted text and
emoticons inside code, HTML, front matter, or URLs are ignored. Each
conversion is a separate undo step, so <kbd>Command-Z</kbd> restores the emoticon.
Mappings that conflict with Markdown syntax are skipped.

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
Custom entries override bundled mappings.

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
