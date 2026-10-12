"""Model-free tests for independent diagnostic APK provenance."""
import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("provenance", Path(__file__).with_name("apk-provenance.py"))
provenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provenance)


class ProvenanceTests(unittest.TestCase):
    def test_signatures_and_zip_layout_do_not_change_payload_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            before, after = Path(directory) / "before.apk", Path(directory) / "after.apk"
            with zipfile.ZipFile(before, "w") as archive:
                archive.writestr("classes.dex", b"original-code")
                archive.writestr("assets/video.bundle", b"original-fixture")
            with zipfile.ZipFile(after, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("META-INF/CERT.RSA", b"different-signature")
                archive.writestr("assets/video.bundle", b"original-fixture")
                archive.writestr("classes.dex", b"original-code")
            result = provenance.compare(before, after)
            self.assertTrue(result["payloadIdentical"])
            self.assertFalse(result["byteIdentical"])
            self.assertTrue(provenance.compare(before, before)["byteIdentical"])

    def test_fixture_changes_and_non_signature_metadata_cannot_be_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            before, after = Path(directory) / "before.apk", Path(directory) / "after.apk"
            for name, content in [("assets/video.bundle", b"changed-fixture"), ("META-INF/services/provider", b"changed-provider")]:
                with zipfile.ZipFile(before, "w") as archive:
                    archive.writestr(name, b"original")
                with zipfile.ZipFile(after, "w") as archive:
                    archive.writestr(name, content)
                self.assertFalse(provenance.compare(before, after)["payloadIdentical"])


if __name__ == "__main__":
    unittest.main()
