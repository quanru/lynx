"""Offline differential check against an unmodified public driver wheel.

Run with the path to lynx_e2e_appium-0.0.15-py3-none-any.whl. Only its Rectangle
and LynxRect AST classes execute; Appium and transport code are never imported.
The wheel is a read-only reference, not a runtime dependency of the new runner.
"""
import ast
import sys
import unittest
import zipfile

import numpy as np

from native_pixels import native_element_bounds
from native_visible_geometry import visible_element_rect


with zipfile.ZipFile(sys.argv[1]) as reference:
    classes = []
    for filename, name in (("rectangle.py", "Rectangle"), ("document_tree.py", "LynxRect")):
        tree = ast.parse(reference.read("lynx_e2e/_impl/core/" + filename))
        classes.append(next(node for node in tree.body
                            if isinstance(node, ast.ClassDef) and node.name == name))
namespace = {}
exec(compile(ast.Module(body=classes, type_ignores=[]), "original-driver-geometry", "exec"), namespace)
Rectangle, LynxRect = namespace["Rectangle"], namespace["LynxRect"]


def original_bounds(physical, body, element, platform):
    scale = 1 if platform == "android" else 3
    container = Rectangle(*(physical[key] / scale for key in ("left", "top", "width", "height")))
    def box(padding):
        return LynxRect(Rectangle(padding[0], padding[1], padding[2] - padding[0],
                                 padding[5] - padding[1]), is_absolute=True)
    body_relative = box(body).get_relative_rect(container, box(body).value)
    absolute = box(element).get_rated_rect(container, body_relative).scale_to_rect(container)
    return dict(left=absolute.left - container.left, top=absolute.top - container.top,
                right=absolute.right - container.left, bottom=absolute.bottom - container.top,
                width=absolute.width, height=absolute.height)


def quad(left, top, width, height):
    return [left, top, left + width, top, left + width, top + height, left, top + height]


class NativeGeometryReferenceTest(unittest.TestCase):
    def test_visible_geometry_matches_original_driver_in_native_points(self):
        rng = np.random.default_rng(20261011)
        for _ in range(2000):
            view = dict(zip(("x", "y", "width", "height"), map(float, rng.uniform(1, 2000, 4))))
            body, element = (quad(*map(float, rng.uniform(1, 2000, 4))) for _ in range(2))
            container = Rectangle(*(view[key] for key in ("x", "y", "width", "height")))
            def box(padding):
                return LynxRect(Rectangle(padding[0], padding[1], padding[2] - padding[0], padding[5] - padding[1]), True)
            original = box(element).get_rated_rect(container, box(body).get_relative_rect(container, box(body).value)).scale_to_rect(container)
            self.assertEqual(visible_element_rect(view, body, element),
                             dict(x=original.left, y=original.top, width=original.width, height=original.height))

    def test_original_driver_geometry_on_both_platforms(self):
        rng = np.random.default_rng(20261010)
        for platform in ("android", "ios"):
            for _ in range(1000):
                left, top, width, height = map(float, rng.uniform(1, 2000, 4))
                physical = dict(left=left, top=top, width=width, height=height)
                body = quad(*map(float, rng.uniform(1, 2000, 4)))
                element = quad(*map(float, rng.uniform(1, 2000, 4)))
                self.assertEqual(native_element_bounds(physical, body, element, platform),
                                 original_bounds(physical, body, element, platform))


unittest.main(argv=[sys.argv[0]])
