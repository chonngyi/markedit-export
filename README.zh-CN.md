# MarkEdit Export

在 MarkEdit 中导出 PDF 和独立 HTML 网页。PDF 由本机 Pandoc 与 XeLaTeX 排版；
HTML 保留公式并内嵌公式字体，可离线阅读。

## 安装

需要 macOS 26、MarkEdit 1.37.1 或以上版本。HTML 预览需要安装 Markdown View Modes；
PDF 需要 Pandoc、MacTeX 和 Xcode Command Line Tools。安装器使用 Python 3。

下载 Releases 中的源码 ZIP，解压后保存文档并退出 MarkEdit，双击 `Install.command`。
也可以在解压目录运行 `python3 scripts/install.py`。安装器会在本机编译助手、备份已有设置，
并将导出按钮放在原生工具栏的斜体按钮旁边。

依赖缺失时会停止安装，不自动下载大型软件，不关闭编辑器。

## 使用

点工具栏的导出按钮，选择纸张、字体、字号和页边距，再导出 PDF 或 HTML。
`Command-S` 仍用于保存源文件。

仅安装目录中的 JavaScript 即可使用 HTML 导出；PDF 还需要安装本地助手。
如果工具栏没有显示按钮，可从 **View → Customize Toolbar…** 添加“导出”。

当前支持带数学公式的 Markdown，以及使用已安装宏包的单文件 `.tex` 文档。
多文件 TeX 工程、Mermaid 转 PDF、远程资源和自动下载宏包不在本版范围内。

源码、编译和导出均留在本机。只编译可信 TeX 文档：关闭 shell escape 仍不能阻止 TeX 读取本地文件。
更多依赖、限制和验证方式见英文 README。
