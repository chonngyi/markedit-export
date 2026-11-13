import base64
import importlib.util
import json
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("installer", ROOT / "scripts/install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class PackagingTests(unittest.TestCase):
    def test_toolbar_preserves_existing_items_and_is_idempotent(self):
        settings = {"editor.customToolbarItems": [{"title": "Other", "actionName": "Other", "icon": "star"}], "editor.fontSize": 17}
        toolbar = {"TB Item Identifiers": ["custom-existing", "app.markedit.editor.toggleItalic", "app.markedit.editor.toggleList"], "TB Display Mode": 1}
        s, t = installer.toolbar_settings(settings, toolbar)
        self.assertEqual(s["editor.fontSize"], 17)
        self.assertEqual(s["editor.customToolbarItems"][0]["title"], "Other")
        self.assertEqual(t["TB Item Identifiers"][0], "custom-existing")
        self.assertEqual(t["TB Item Identifiers"][-1], "app.markedit.editor.toggleList")
        self.assertEqual(t["TB Display Mode"], 1)
        self.assertEqual(installer.toolbar_settings(s, t), (s, t))

    def test_xelatex_symlink_keeps_latex_invocation_name(self):
        # xetex chooses its format using argv[0]; resolving xelatex breaks LaTeX.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "xetex").write_text("binary")
            (root / "xelatex").symlink_to(root / "xetex")
            with mock.patch.object(installer.shutil, "which", return_value=str(root / "xelatex")):
                self.assertEqual(Path(installer.tool("xelatex")).name, "xelatex")

    def test_install_backs_up_and_preserves_unrelated_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            data = home / installer.MARKEDIT_DATA
            (data / "scripts").mkdir(parents=True)
            (data / "settings.json").write_text('{"editor.autoSaveWhenIdle": false}')
            (data / "scripts/markedit-export.js").write_text("old extension")
            extension = home / "new.js"
            extension.write_text("new extension")
            helper = home / "build/MarkEdit Export Helper.app"
            helper.mkdir(parents=True)
            (helper / "source.txt").write_text("helper")
            with mock.patch.object(installer.subprocess, "run"):
                backup = installer.install(home, extension, helper, {"pandoc": "/usr/local/bin/pandoc"})
            self.assertEqual((backup / "markedit-export.js").read_text(), "old extension")
            self.assertFalse(json.loads((data / "settings.json").read_text())["editor.autoSaveWhenIdle"])
            self.assertEqual((data / "scripts/markedit-export.js").read_text(), "new extension")

    def test_embedded_fonts_have_expected_format(self):
        fonts = json.loads((ROOT / "vendor/katex-fonts.json").read_text())
        self.assertEqual(len(fonts), 20)
        for name, content in fonts.items():
            self.assertTrue(name.endswith(".woff2"))
            self.assertTrue(base64.b64decode(content, validate=True).startswith(b"wOF2"))

    def test_generated_asset_is_self_contained(self):
        script = (ROOT / "dist/markedit-export.js").read_text()
        self.assertNotIn("__MARKEDIT_EXPORT_FONTS__", script)
        self.assertNotIn("export-support/fonts.json", script)
        self.assertIn("Khan Academy", script)


if __name__ == "__main__":
    unittest.main()
