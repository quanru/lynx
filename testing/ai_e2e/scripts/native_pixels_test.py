"""Differential checks against the original comparator AST supplied on stdin."""
import ast
import os
import sys
from types import SimpleNamespace
import unittest

import cv2
import numpy as np

from native_pixels import compare_native_pixels, NativePixelMismatch


source = ast.parse(sys.stdin.read())
original_class = next(node for node in source.body
                      if isinstance(node, ast.ClassDef) and node.name == "ImageDiffMixin")
original_config = next(node for node in source.body
                       if isinstance(node, ast.ClassDef) and node.name == "ImageConfig")


def original_comparison(actual, baseline):
    logs = []
    # Execute the unchanged source algorithm without filesystem mutations or
    # importing its Appium/logger dependencies. Image operations use real cv2.
    backend = SimpleNamespace(
        imread=lambda path: baseline.copy() if path.startswith("resources/") else actual.copy(),
        imwrite=lambda *args: True,
        cvtColor=cv2.cvtColor, absdiff=cv2.absdiff,
        COLOR_BGR2GRAY=cv2.COLOR_BGR2GRAY, COLOR_GRAY2BGR=cv2.COLOR_GRAY2BGR,
    )
    namespace = {
        "os": SimpleNamespace(environ={}, remove=lambda path: None,
                              path=SimpleNamespace(join=os.path.join, exists=lambda path: True)),
        "cv2": backend, "numpy": np,
        "settings": SimpleNamespace(PROJECT_ROOT=""),
        "EnumLogLevel": SimpleNamespace(INFO="info"),
    }
    exec(compile(ast.Module(body=[original_config, original_class], type_ignores=[]), "original-comparator", "exec"), namespace)
    original = namespace["ImageDiffMixin"]("android")
    original.log_record = lambda *args, **kwargs: logs.append(kwargs)
    try:
        original._inner_diff_img("image.png", "captures", 0.01, SimpleNamespace(name="Image"))
        return True
    except RuntimeError:
        return False


def migrated_comparison(actual, baseline):
    try:
        compare_native_pixels(actual, baseline)
        return True
    except (NativePixelMismatch, ValueError):
        return False


class NativePixelsTest(unittest.TestCase):
    def test_grayscale_not_rgb_similarity(self):
        baseline = np.full((10, 10, 3), 76, dtype=np.uint8)
        actual = np.full((10, 10, 3), [0, 0, 255], dtype=np.uint8)
        self.assertTrue(original_comparison(actual, baseline))
        self.assertEqual(compare_native_pixels(actual, baseline), 0)

    def test_original_threshold_boundaries(self):
        baseline = np.zeros((10, 10, 3), dtype=np.uint8)
        for difference, changed, expected in [(25, 100, True), (26, 1, True), (26, 2, False)]:
            actual = baseline.copy()
            actual.reshape(-1, 3)[:changed] = difference
            self.assertEqual(original_comparison(actual, baseline), expected)
            self.assertEqual(migrated_comparison(actual, baseline), expected)

    def test_randomized_original_conformance(self):
        rng = np.random.default_rng(20261009)
        for changed in [0, 1, 4, 5, 20, 400]:
            for _ in range(20):
                baseline = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
                actual = baseline.copy()
                actual.reshape(-1, 3)[:changed] = rng.integers(0, 256, (changed, 3), dtype=np.uint8)
                self.assertEqual(migrated_comparison(actual, baseline), original_comparison(actual, baseline))

    def test_dimensions_and_invalid_images_fail(self):
        baseline = np.zeros((10, 10, 3), dtype=np.uint8)
        wrong = np.zeros((9, 10, 3), dtype=np.uint8)
        self.assertFalse(original_comparison(wrong, baseline))
        self.assertFalse(migrated_comparison(wrong, baseline))
        for actual in [None, np.zeros((0, 0, 3), dtype=np.uint8), baseline.astype(np.float64), baseline[:, :, 0]]:
            with self.assertRaises(ValueError):
                compare_native_pixels(actual, baseline)


unittest.main(argv=[sys.argv[0]])
