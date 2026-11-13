# Validation for 0.1.0

Verified on one Apple Silicon Mac with macOS 26.6, MarkEdit 1.37.1,
Pandoc 3.13 and the installed XeLaTeX distribution.

- Five package tests cover setting preservation, toolbar idempotence, backup,
  font payload integrity, and preserving the `xelatex` symlink invocation name.
- Compiler smoke checks use synthetic Markdown and TeX. They verify Chinese
  text, math, actual Heiti embedding, A4/Letter dimensions, custom macros,
  compiler errors, remote-image refusal, and request path/symlink boundaries.
- The release JavaScript staged a synthetic request from the real MarkEdit
  sandbox. A separately named validation helper was explicitly launched through
  LaunchServices, and the PDF response returned successfully. This did not
  replace the user's installed helper or its default file association.
- The single-file HTML build was checked in a browser DOM against a synthetic
  fixture produced by MarkEdit. All 20 formula fonts were embedded; no external
  font URLs, injected scripts, or unsafe links remained.

The native toolbar button and PDF/HTML save actions were exercised during
development. The installer backs up settings and refuses to install while
MarkEdit is running. Installer filesystem behavior and toolbar layout changes
have automated tests; a fresh-machine install and Intel execution have not yet
been verified. These are the limits of this release's validation.
