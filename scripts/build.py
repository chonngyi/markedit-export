#!/usr/bin/env python3
"""Build the single-file registry asset and local helper from checked-in sources."""
import hashlib
import json
import plistlib
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.0"
APP_NAME = "MarkEdit Export Helper.app"


def build_extension():
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    source = (ROOT / "src/markedit-export.js").read_text()
    fonts = json.loads((ROOT / "vendor/katex-fonts.json").read_text())
    assert len(fonts) == 20
    license_text = (ROOT / "vendor/KaTeX-LICENSE.txt").read_text().strip()
    banner = "/*\nKaTeX fonts 0.19.0\n" + license_text + "\n*/\n"
    output = banner + source.replace("__MARKEDIT_EXPORT_FONTS__", json.dumps(fonts, separators=(",", ":")))
    target = dist / "markedit-export.js"
    target.write_text(output)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (dist / "SHA256SUMS").write_text(digest + "  markedit-export.js\n")
    return target


def build_helper(output=None):
    app = Path(output) if output else ROOT / "build" / APP_NAME
    macos = app / "Contents/MacOS"
    resources = app / "Contents/Resources"
    macos.mkdir(parents=True, exist_ok=True)
    resources.mkdir(parents=True, exist_ok=True)
    subprocess.run(["xcrun", "swiftc", "-module-cache-path", str(ROOT / "build/swift-cache"), "-O", str(ROOT / "helper/ExportHelper.swift"), "-o", str(macos / "MarkEditExportHelper")], check=True)
    shutil.copy2(ROOT / "helper/ExportHelper.swift", resources / "ExportHelper.swift")
    info = {
        "CFBundleIdentifier": "io.github.chonngyi.markedit-export.helper",
        "CFBundleName": "MarkEdit Export Helper",
        "CFBundleExecutable": "MarkEditExportHelper",
        "CFBundleVersion": "1",
        "CFBundleShortVersionString": VERSION,
        "CFBundlePackageType": "APPL",
        "LSUIElement": True,
        "LSMinimumSystemVersion": "26.0",
        "NSPrincipalClass": "NSApplication",
        "CFBundleDocumentTypes": [{
            "CFBundleTypeName": "MarkEdit Export Request",
            "CFBundleTypeRole": "Editor",
            "LSHandlerRank": "Owner",
            "LSItemContentTypes": ["io.github.chonngyi.markedit-export.request"],
        }],
        "UTExportedTypeDeclarations": [{
            "UTTypeIdentifier": "io.github.chonngyi.markedit-export.request",
            "UTTypeDescription": "MarkEdit Export Request",
            "UTTypeConformsTo": ["public.json"],
            "UTTypeTagSpecification": {"public.filename-extension": ["markeditexport"]},
        }],
    }
    (app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
    subprocess.run(["codesign", "--force", "--sign", "-", str(app)], check=True)
    return app


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--helper", action="store_true")
    args = parser.parse_args()
    print(build_extension())
    if args.helper:
        print(build_helper())
