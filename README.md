# MarkEdit Export

Export Markdown from MarkEdit to PDF or self-contained HTML. PDF uses local
Pandoc and XeLaTeX; HTML includes rendered math and embedded formula fonts.

The export panel has paper, font, size, and margin controls, with light and dark
appearances. PDF font choices are Heiti SC and Songti SC. Its interface is currently in Chinese.

## Requirements

- macOS 26 and MarkEdit 1.37.1 or later. Version 1.37.1 is the version tested.
- [Markdown View Modes](https://markedit-app.github.io/extensions/#markedit-preview)
  for HTML export and content preview.
- For PDF: [Pandoc](https://pandoc.org/installing.html),
  [MacTeX](https://www.tug.org/mactex/), and Xcode Command Line Tools.
- Python 3 for the installer.

## Install

Download and extract the source ZIP from [Releases](https://github.com/chonngyi/markedit-export/releases).
Save your documents and quit MarkEdit, then double-click `Install.command`.
Alternatively, run `python3 scripts/install.py` from the extracted directory.
The installer builds the helper locally, backs up existing settings, and adds
the export button beside Italic in the native toolbar. It does not install
Pandoc or MacTeX, change the default Markdown/PDF application, or close your editor.

To check dependencies without changing anything:

```sh
python3 scripts/install.py --check
```

The helper is built from source and signed locally; no prebuilt notarized binary
is supplied. Command Line Tools can be installed with `xcode-select --install`.

## Use

Click the export icon beside Italic, or choose **Extensions → 导出文档…**
(`Shift-Command-E`). Choose PDF or HTML and select where to save it.
`Command-S` continues to save the source document.

PDF supports Markdown math and single-file `.tex` documents with installed
packages. A `.tex` document uses its own page layout. The preview shows HTML
content; XeLaTeX determines the final PDF layout.

The registry JavaScript can also be installed on its own for HTML export.
PDF still needs the locally built helper. If the toolbar button is absent,
choose **View → Customize Toolbar…** and drag **导出** beside Italic.

## Limits and privacy

The extension and helper do not upload documents or use a network service.
Compile only trusted TeX: shell escape is disabled, but TeX can still read local files.
Temporary compiler files are removed after the response is produced.

HTML refuses remote images; use local image paths. PDF rejects remote image URLs. Multi-file TeX projects, Mermaid-to-PDF conversion, and automatic
package downloads are outside this release. Local assets may require macOS
file access permission. The bundled HTML math fonts match KaTeX 0.19.0; a future
preview renderer with different fonts may require an extension update.

## Uninstall

Quit MarkEdit, remove `markedit-export.js` from its customization `scripts`
folder, and remove `~/Applications/MarkEdit Export Helper.app`. Remove the
custom export item through Customize Toolbar. Installer backups remain under
`~/Library/Application Support/MarkEdit Export/backups`.

## Build and check

```sh
python3 scripts/build.py --helper
python3 -m unittest discover -s tests -v
node --check dist/markedit-export.js
python3 tests/smoke.py
```

`tests/smoke.py` uses synthetic inputs. It does not read your notes or install the
helper. Real MarkEdit bridge validation is described in `VALIDATION.md`.

## License

MIT. Third-party notices are in `THIRD_PARTY_NOTICES.md`.
