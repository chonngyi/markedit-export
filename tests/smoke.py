#!/usr/bin/env python3
"""Compile synthetic requests in an isolated directory; never install or read notes."""
import base64
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "build/MarkEdit Export Helper.app/Contents/MacOS/MarkEditExportHelper"


def main():
    if not BINARY.exists():
        raise SystemExit("Run python3 scripts/build.py --helper first")
    with tempfile.TemporaryDirectory(prefix="markedit-export-smoke-") as directory:
        work = Path(directory)
        env = dict(os.environ, MARKEDIT_EXPORT_JOBS_ROOT=str(work))
        def run(name, content, source, options=None, version=1):
            request = work / (name + ".markeditexport")
            request.write_text(json.dumps({"version": version, "content": content, "sourcePath": source, "options": options or {"paper": "A4", "font": "serif", "size": "11", "margin": "20"}}))
            subprocess.run([str(BINARY), "--compile", str(request)], env=env, check=True, timeout=120)
            result = json.loads(request.read_text())
            assert result["status"] == "done", result
            return result
        def inspect(name, result):
            assert result["ok"], result
            pdf = base64.b64decode(result["data"], validate=True)
            assert pdf.startswith(b"%PDF-")
            path = work / (name + ".pdf")
            path.write_bytes(pdf)
            output = subprocess.check_output(["swift", "-module-cache-path", str(ROOT / "build/swift-test-cache"), str(ROOT / "tests/pdf_text.swift"), str(path)], text=True)
            return json.loads(output)
        markdown = (ROOT / "examples/math.md").read_text()
        a4 = inspect("markdown", run("markdown", markdown, str(ROOT / "examples/math.md")))
        assert "中文" in a4["text"] and "数学" in a4["text"] and a4["pages"] >= 1
        assert abs(a4["width"] - 595.3) < 1 and abs(a4["height"] - 841.9) < 1
        letter = inspect("letter", run("letter", "# Letter 控制\n\nPaper and font control. [Link](https://example.invalid).", None, {"paper": "Letter", "font": "sans", "size": "14", "margin": "30"}))
        assert "控制" in letter["text"] and any("STHeitiSC" in name for name in letter["fonts"]), letter
        assert abs(letter["width"] - 612) < 1 and abs(letter["height"] - 792) < 1
        raw = inspect("tex", run("tex", (ROOT / "examples/document.tex").read_text(), str(ROOT / "examples/document.tex")))
        assert "自定义宏" in raw["text"]
        bad = run("bad", r"\documentclass{article}\begin{document}\notARealCommand\end{document}", "bad.tex")
        assert not bad["ok"] and "编译失败" in bad["error"]
        remote = run("remote", "![remote](https://example.invalid/image.png)", None)
        assert not remote["ok"] and "远程图片" in remote["error"]
        invalid = run("version", "test", None, version=99)
        assert not invalid["ok"] and "版本" in invalid["error"]
        # Requests outside the allowed root must remain untouched.
        outside = work.parent / (work.name + "-outside.markeditexport")
        try:
            outside.write_text("sentinel")
            subprocess.run([str(BINARY), "--compile", str(outside)], env=env, check=True)
            assert outside.read_text() == "sentinel"
            link = work / "link.markeditexport"
            link.symlink_to(outside)
            subprocess.run([str(BINARY), "--compile", str(link)], env=env, check=True)
            assert outside.read_text() == "sentinel"
        finally:
            outside.unlink(missing_ok=True)
    print("PASS: Markdown/CJK/math, Letter, raw TeX/macros, errors, remote-image refusal, request boundary")


if __name__ == "__main__":
    main()
