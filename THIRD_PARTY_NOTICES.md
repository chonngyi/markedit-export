# Third-party components

`vendor/katex-fonts.json` contains 20 unmodified WOFF2 fonts from
[KaTeX 0.19.0](https://github.com/KaTeX/KaTeX/tree/v0.19.0).
Their MIT license is preserved in `vendor/KaTeX-LICENSE.txt` and in the
single-file extension build.

The extension calls the public HTML rendering API of
[MarkEdit-preview](https://github.com/MarkEdit-app/MarkEdit-preview), which is
installed separately. Its JavaScript is not included here.

Pandoc, XeLaTeX, macOS system fonts, and Xcode Command Line Tools are external
dependencies. They are not redistributed by this project.
