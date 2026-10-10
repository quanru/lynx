"""Exercise the real JPEG decode/crop/compare/evidence bridge without a model."""
import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np

from native_pixels import NativePixelMismatch

spec = importlib.util.spec_from_file_location("capture", Path(__file__).with_name("compare-native-capture.py"))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class NativeCaptureTest(unittest.TestCase):
    def test_full_view_baselines_use_original_second_crop_on_both_platforms(self):
        image = np.full((30, 40, 3), 100, dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpeg", image)
        self.assertTrue(ok)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = root / "baseline.png"
            cv2.imwrite(str(baseline), image[3:23])
            original = baseline.read_bytes()
            for platform in ("android", "ios"):
                payload = dict(frame=base64.b64encode(encoded).decode(), platform=platform,
                               rect=dict(left=0, top=3, width=40, height=20))
                self.assertEqual(capture.compare_capture(payload, baseline, root / platform), 0)
                self.assertEqual(baseline.read_bytes(), original)
                self.assertEqual(cv2.imread(str(root / platform / "actual.png")).shape, (20, 40, 3))

    def test_fractional_full_view_keeps_truncation_after_initial_rounded_capture(self):
        image = np.full((30, 40, 3), 100, dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpeg", image)
        self.assertTrue(ok)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = root / "baseline.png"
            cv2.imwrite(str(baseline), image[:15, :20])
            for platform in ("android", "ios"):
                payload = dict(frame=base64.b64encode(encoded).decode(), platform=platform,
                               rect=dict(left=1.25, top=2.75, width=20.75, height=15.5))
                self.assertEqual(capture.compare_capture(payload, baseline, root / platform), 0)
                self.assertEqual(cv2.imread(str(root / platform / "actual.png")).shape, (15, 20, 3))

    def test_real_jpeg_crop_and_failure_evidence_without_baseline_mutation(self):
        image = np.full((30, 40, 3), 100, dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpeg", image, [cv2.IMWRITE_JPEG_QUALITY, 100])
        self.assertTrue(ok)
        payload = dict(frame=base64.b64encode(encoded).decode(), platform="android",
                       rect=dict(left=0, top=3, width=40, height=20),
                       bodyPadding=[0, 3, 40, 3, 40, 23, 0, 23],
                       elementPadding=[0, 3, 40, 3, 40, 8, 0, 8])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = root / "baseline.png"
            cv2.imwrite(str(baseline), image[:5])
            original = baseline.read_bytes()
            self.assertEqual(capture.compare_capture(payload, baseline, root / "pass"), 0)
            for name in ("frame.jpeg", "geometry.json", "actual.png", "baseline.png"):
                self.assertTrue((root / "pass" / name).is_file())
            self.assertNotIn("frame", (root / "pass" / "geometry.json").read_text())
            with self.assertRaises(FileExistsError):
                capture.compare_capture(payload, baseline, root / "pass")
            cv2.imwrite(str(baseline), np.zeros((5, 40, 3), dtype=np.uint8))
            changed = baseline.read_bytes()
            with self.assertRaises(NativePixelMismatch):
                capture.compare_capture(payload, baseline, root / "fail")
            self.assertEqual(baseline.read_bytes(), changed)
            self.assertNotEqual(original, changed)
            self.assertTrue((root / "fail" / "actual.png").is_file())
            with self.assertRaises(ValueError):
                capture.compare_capture(payload, root / "missing.png", root / "missing")


unittest.main()
