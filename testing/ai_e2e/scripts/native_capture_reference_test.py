"""Replay a captured pixel failure through unchanged original driver/helper AST.

Usage: python native_capture_reference_test.py DRIVER_WHEEL EVIDENCE_DIRECTORY
This optional offline diagnostic needs no device, model, Appium or credentials.
It never changes the evidence or checked-in baseline; original helper writes
are confined to a fresh temporary directory.
"""
import ast
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import zipfile

import cv2
import numpy

from native_pixels import compare_native_pixels, NativePixelMismatch


def replay_reference(wheel, evidence):
    evidence = Path(evidence)
    geometry = json.loads((evidence / "geometry.json").read_text())
    platform = geometry["platform"]
    scale = {"android": 1, "ios": 3}[platform]
    with zipfile.ZipFile(wheel) as reference:
        classes = []
        for filename, name in (("rectangle.py", "Rectangle"), ("document_tree.py", "LynxRect")):
            tree = ast.parse(reference.read("lynx_e2e/_impl/core/" + filename))
            classes.append(next(node for node in tree.body
                                if isinstance(node, ast.ClassDef) and node.name == name))
        driver = ast.parse(reference.read("lynx_e2e/_impl/core/lynx_driver.py"))
        driver_class = next(node for node in driver.body
                            if isinstance(node, ast.ClassDef) and node.name == "LynxDriver")
        screenshot = next(node for node in driver_class.body
                          if isinstance(node, ast.FunctionDef) and node.name == "screenshot")
    namespace = {"base64": base64}
    exec(compile(ast.Module(body=classes + [screenshot], type_ignores=[]),
                 "unchanged-public-driver", "exec"), namespace)
    rectangle, lynx_rect = namespace["Rectangle"], namespace["LynxRect"]
    geometry_source = "supplied-capture-rectangle"
    if "nativeViews" in geometry:
        # Use the independently read WDA rectangle of the original native
        # wrapper, never geometry inferred from a screenshot or baseline.
        views = geometry["nativeViews"]
        if not isinstance(views, list) or len(views) != 1:
            raise AssertionError("Reference replay requires one visible native view")
        values = [views[0][key] for key in ("x", "y", "width", "height")]
        numpy.testing.assert_array_equal(
            numpy.array(values) * scale,
            [geometry["rect"][key] for key in ("left", "top", "width", "height")])
        rect = rectangle(*values)
        geometry_source = "independent-visible-WDA-view"
    else:
        rect = rectangle(*(geometry["rect"][key] / scale
                           for key in ("left", "top", "width", "height")))
    def box(padding):
        return lynx_rect(rectangle(padding[0], padding[1], padding[2] - padding[0],
                                  padding[5] - padding[1]), is_absolute=True)
    if geometry.get("elementPadding") is not None:
        body = box(geometry["bodyPadding"])
        element = box(geometry["elementPadding"])
        absolute = element.get_rated_rect(rect, body.get_relative_rect(rect, body.value)).scale_to_rect(rect)
    else:
        # Original Image/LayoutLinear pass the entire native view rectangle.
        absolute = rect
    helper_source = Path(__file__).resolve().parents[2] / "integration_test/test_script/lib/test_runner/mixin/img_diff_mixin.py"
    helper_classes = [node for node in ast.parse(helper_source.read_text()).body
                      if isinstance(node, ast.ClassDef)]
    with tempfile.TemporaryDirectory(prefix="lynx-original-capture-") as temporary:
        root = Path(temporary)
        baseline_dir = root / "resources" / platform
        baseline_dir.mkdir(parents=True)
        shutil.copyfile(evidence / "baseline.png", baseline_dir / "capture.png")
        helper_namespace = {"cv2": cv2, "numpy": numpy, "os": os,
                            "settings": SimpleNamespace(PROJECT_ROOT=str(root)),
                            "EnumLogLevel": SimpleNamespace(INFO=1)}
        exec(compile(ast.Module(body=helper_classes, type_ignores=[]),
                     "unchanged-original-image-helper", "exec"), helper_namespace)
        helper = helper_namespace["ImageDiffMixin"](platform)
        helper.current_case = SimpleNamespace(name="captured-reference")
        helper.log_record = lambda *args, **kwargs: None
        helper.add_img_config("capture.png", helper_namespace["ImageConfig"](
            x_min=absolute.left - rect.left, x_max=absolute.right - rect.left,
            y_min=absolute.top - rect.top, y_max=absolute.bottom - rect.top,
            resize_width=absolute.width, resize_height=absolute.height,
            width_scale=scale, height_scale=scale))
        original_driver = SimpleNamespace(
            _view=SimpleNamespace(pixel_ratio=scale), get_session_id=lambda: 1,
            _debugger=SimpleNamespace(screencast_frame=lambda session: {
                "data": base64.b64encode((evidence / "frame.jpeg").read_bytes()).decode("ascii")}))
        namespace["screenshot"](original_driver, str(root / "capture.png"), rect)
        with contextlib.redirect_stdout(io.StringIO()):
            helper._crop_and_resize_img("capture.png", str(root))
        original_actual = cv2.imread(str(root / "capture.png"))
        migrated_actual = cv2.imread(str(evidence / "actual.png"))
        numpy.testing.assert_array_equal(original_actual, migrated_actual)
        original_error = None
        try:
            helper._inner_diff_img("capture.png", str(root), 0.01, helper.current_case)
        except RuntimeError as error:
            original_error = str(error)
        migrated_error = None
        try:
            compare_native_pixels(migrated_actual, cv2.imread(str(evidence / "baseline.png")))
        except (NativePixelMismatch, ValueError) as error:
            migrated_error = str(error)
        assert bool(original_error) == bool(migrated_error), (original_error, migrated_error)
        return {"platform": platform, "identicalPixels": True, "geometrySource": geometry_source,
                "originalError": original_error, "migratedError": migrated_error}


if __name__ == "__main__":
    print(json.dumps(replay_reference(*sys.argv[1:])))
