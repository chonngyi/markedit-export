#!/usr/bin/env python3
"""Install for the current user. Existing documents and settings are preserved."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKEDIT_DATA = Path("Library/Containers/app.cyan.markedit/Data/Documents")
TOOLBAR_KEY = "NSToolbar Configuration EditorToolbar"
TOOLBAR_SPEC = {"title": "导出", "icon": "square.and.arrow.up", "actionName": "导出文档…"}


def tool(name):
    path = shutil.which(name)
    if path:
        return str(Path(path).absolute())
    for directory in ["/Library/TeX/texbin", "/opt/homebrew/bin", "/usr/local/bin"]:
        path = Path(directory) / name
        if os.access(str(path), os.X_OK):
            return str(path)
    return None


def toolbar_settings(existing, toolbar):
    settings = dict(existing)
    specs = list(settings.get("editor.customToolbarItems", []))
    specs = [s for s in specs if s.get("actionName") not in ("导出文档…", "Export Document…")]
    specs.append(dict(TOOLBAR_SPEC))
    settings["editor.customToolbarItems"] = specs
    config = dict(toolbar)
    default = ["app.markedit.editor." + s for s in ["tableOfContents", "formatHeaders", "toggleBold", "toggleItalic", "toggleList"]]
    identifier = "app.markedit.custom." + hashlib.sha256("-".join(TOOLBAR_SPEC.values()).encode()).hexdigest()
    items = [s for s in config.get("TB Item Identifiers", default) if s != identifier]
    after = "app.markedit.editor.toggleItalic"
    index = items.index(after) + 1 if after in items else len(items)
    items.insert(index, identifier)
    config.update({"TB Item Identifiers": items, "TB Default Item Identifiers": default, "TB Is Shown": True})
    config.setdefault("TB Display Mode", 2)
    return settings, config


def install(home, extension, helper, tools, dry_run=False):
    data = home / MARKEDIT_DATA
    if not data.exists():
        raise RuntimeError("Open MarkEdit once, then quit it before installing.")
    settings_path = data / "settings.json"
    existing = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    pref_path = home / "Library/Containers/app.cyan.markedit/Data/Library/Preferences/app.cyan.markedit.plist"
    prefs = plistlib.loads(pref_path.read_bytes()) if pref_path.exists() else {}
    settings, config = toolbar_settings(existing, prefs.get(TOOLBAR_KEY, {}))
    if dry_run:
        return settings, config
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = home / "Library/Application Support/MarkEdit Export/backups" / stamp
    backup.mkdir(parents=True)
    destination = data / "scripts/markedit-export.js"
    app = home / "Applications" / helper.name
    for path in [destination, settings_path, pref_path]:
        if path.exists():
            shutil.copy2(path, backup / path.name)
    if app.exists():
        shutil.copytree(app, backup / app.name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    app.parent.mkdir(parents=True, exist_ok=True)
    if app.exists():
        shutil.rmtree(app)
    shutil.copytree(helper, app)
    shutil.copy2(extension, destination)
    settings_path.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n")
    config_path = home / "Library/Application Support/MarkEdit Export/tools.json"
    config_path.write_text(json.dumps(tools, indent=2) + "\n")
    subprocess.run(["defaults", "write", "app.cyan.markedit", TOOLBAR_KEY, plistlib.dumps(config).decode()], check=True)
    register = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    subprocess.run([register, "-f", str(app)], check=True)
    marker = data / "markedit-export/helper.json"
    marker.parent.mkdir(exist_ok=True)
    marker.write_text(json.dumps({"version": "0.1.0"}) + "\n")
    return backup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Check prerequisites without changing files")
    args = parser.parse_args()
    tools = {name: tool(name) for name in ["pandoc", "xelatex"]}
    missing = [name for name, path in tools.items() if not path]
    if not shutil.which("xcrun"):
        missing.append("Xcode Command Line Tools")
    print("Dependencies: " + ", ".join(name + (" OK" if path else " missing") for name, path in tools.items()))
    if missing:
        raise RuntimeError("Install first: " + ", ".join(missing))
    if args.check:
        return
    if subprocess.run(["pgrep", "-x", "MarkEdit"], stdout=subprocess.DEVNULL).returncode == 0:
        raise RuntimeError("Save your documents and quit MarkEdit before installing. The installer will not close it.")
    spec = importlib.util.spec_from_file_location("export_build", ROOT / "scripts/build.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    extension = module.build_extension()
    helper = module.build_helper()
    backup = install(Path.home(), extension, helper, tools)
    print("Installed. Open MarkEdit and click the export icon beside Italic.")
    print("Backup: " + str(backup))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
