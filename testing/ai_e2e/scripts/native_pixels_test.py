"""Differential checks against the original comparator AST supplied on stdin."""
import ast
import os
import sys
import contextlib
import io
from types import SimpleNamespace
import unittest

import cv2
import numpy as np

from native_pixels import compare_native_pixels, crop_native_view, crop_native_element, native_element_bounds, NativePixelMismatch


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


def original_crop(image, bounds, platform):
    saved = []
    backend = SimpleNamespace(imread=lambda path: image.copy(),
                              imwrite=lambda path, result: saved.append(result.copy()) or True,
                              resize=cv2.resize, INTER_CUBIC=cv2.INTER_CUBIC)
    namespace = {"os": SimpleNamespace(environ={}, path=os.path), "cv2": backend}
    exec(compile(ast.Module(body=[original_config, original_class], type_ignores=[]), "original-crop", "exec"), namespace)
    original = namespace["ImageDiffMixin"](platform)
    scale = 1 if platform == "android" else 3
    config = namespace["ImageConfig"](x_min=bounds["left"], x_max=bounds["right"],
                                      y_min=bounds["top"], y_max=bounds["bottom"],
                                      resize_width=bounds["width"], resize_height=bounds["height"],
                                      width_scale=scale, height_scale=scale)
    original.add_img_config("image.png", config)
    with contextlib.redirect_stdout(io.StringIO()):
        original._crop_and_resize_img("image.png", "captures")
    return saved[0]


class NativePixelsTest(unittest.TestCase):
    def test_element_geometry_preserves_original_driver_rounding(self):
        body = [0, 0, 360, 0, 360, 554.6666666666666, 0, 554.6666666666666]
        element = [0, 70, 360, 70, 360, 93.66666666666667, 0, 93.66666666666667]
        physical = dict(left=0, top=210, width=1080, height=1664)
        for platform, expected in (("android", dict(left=0, top=0, right=1080, bottom=71, width=1080, height=71)),
                                   ("ios", dict(left=0, top=0, right=360, bottom=23.67, width=360, height=23.67))):
            self.assertEqual(native_element_bounds(physical, body, element, platform), expected)

    def test_invalid_element_geometry_fails(self):
        rect = dict(left=0, top=210, width=1080, height=1664)
        quad = [0, 0, 360, 0, 360, 500, 0, 500]
        for invalid in [None, [], quad[:-1], [True] + quad[1:], [float("nan")] + quad[1:],
                        [0, 0, 0, 0, 0, 500, 0, 500]]:
            with self.assertRaises(ValueError):
                native_element_bounds(rect, invalid, quad, "ios")
            with self.assertRaises(ValueError):
                native_element_bounds(rect, quad, invalid, "android")
        for override in [dict(left=-1), dict(top=True), dict(width=0), dict(height=float("inf"))]:
            with self.assertRaises(ValueError):
                native_element_bounds({**rect, **override}, quad, quad, "ios")
        with self.assertRaises(ValueError):
            native_element_bounds(rect, quad, quad, "unknown")

    def test_view_crop_preserves_original_normalization_and_ties_even_rounding(self):
        image = np.arange(20 * 30 * 3, dtype=np.uint8).reshape(20, 30, 3)
        rect = dict(left=1.5, top=2.5, width=3, height=3)
        for platform in ("android", "ios"):
            np.testing.assert_array_equal(crop_native_view(image, rect, platform), image[2:6, 2:4])
        # On iOS, dividing and then multiplying is deliberately not collapsed.
        rng = np.random.default_rng(20261010)
        for platform, scale in (("android", 1), ("ios", 3)):
            for _ in range(100):
                left, top = rng.uniform(0, 5, 2)
                width, height = rng.uniform(2, 8, 2)
                rect = dict(left=float(left), top=float(top), width=float(width), height=float(height))
                logical = {key: value / scale for key, value in rect.items()}
                expected = image[
                    int(round(logical["top"] * scale)):int(round((logical["top"] + logical["height"]) * scale)),
                    int(round(logical["left"] * scale)):int(round((logical["left"] + logical["width"]) * scale))]
                np.testing.assert_array_equal(crop_native_view(image, rect, platform), expected)

    def test_invalid_view_crop_fails_without_clamping_or_resizing(self):
        image = np.zeros((20, 30, 3), dtype=np.uint8)
        rect = dict(left=1, top=2, width=3, height=4)
        for override in [dict(left=-1), dict(top=True), dict(width=0), dict(height=float("inf")),
                         dict(width=100), dict(height=0.1), dict(extra=1)]:
            with self.assertRaises(ValueError):
                crop_native_view(image, {**rect, **override}, "android")
        for invalid in [None, image.astype(np.float64), image[:, :, 0], image[:0]]:
            with self.assertRaises(ValueError):
                crop_native_view(invalid, rect, "android")
        with self.assertRaises(ValueError):
            crop_native_view(image, rect, "unknown")

    def test_original_crop_and_cubic_resize_on_both_platforms(self):
        rng = np.random.default_rng(20261009)
        image = rng.integers(0, 256, (120, 150, 3), dtype=np.uint8)
        for platform in ("android", "ios"):
            for _ in range(25):
                left, top = rng.uniform(0, 10, 2)
                width, height = rng.uniform(5, 20, 2)
                bounds = dict(left=float(left), top=float(top), right=float(left + width),
                              bottom=float(top + height), width=float(width), height=float(height))
                np.testing.assert_array_equal(crop_native_element(image, bounds, platform),
                                              original_crop(image, bounds, platform))

    def test_invalid_crops_cannot_select_another_region(self):
        image = np.zeros((30, 30, 3), dtype=np.uint8)
        valid = dict(left=1, top=1, right=5, bottom=5, width=4, height=4)
        for override in [dict(left=-1), dict(right=100), dict(width=0), dict(left=float("nan")), dict(top=True)]:
            with self.assertRaises(ValueError):
                crop_native_element(image, {**valid, **override}, "android")
        with self.assertRaises(ValueError):
            crop_native_element(image, valid, "unknown")

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
