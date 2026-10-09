"""Original native grayscale comparison; no Appium, baseline update or retry."""
from importlib.metadata import version
import math

import cv2
import numpy as np


class NativePixelMismatch(RuntimeError):
    def __init__(self, mismatch_rate):
        self.mismatch_rate = mismatch_rate
        super().__init__(f"Native image comparison failed: mismatch rate {mismatch_rate}")


def crop_native_element(view_image, bounds, platform):
    """Crop an already LynxView-cropped image, using original relative bounds."""
    if platform not in ("android", "ios"):
        raise ValueError("Unknown native pixel platform")
    scale = 1 if platform == "android" else 3
    if (not isinstance(view_image, np.ndarray) or view_image.dtype != np.uint8
            or view_image.ndim != 3 or view_image.shape[2] != 3 or not view_image.size):
        raise ValueError("Native crop requires a nonempty uint8 BGR LynxView capture")
    if (not isinstance(bounds, dict) or set(bounds) != {"left", "top", "right", "bottom", "width", "height"}
            or any(not isinstance(value, (int, float)) or isinstance(value, bool)
                   or not math.isfinite(value) for value in bounds.values())):
        raise ValueError("Invalid native crop bounds")
    left, right = int(bounds["left"] * scale), int(bounds["right"] * scale)
    top, bottom = int(bounds["top"] * scale), int(bounds["bottom"] * scale)
    width, height = int(bounds["width"] * scale), int(bounds["height"] * scale)
    if (left < 0 or top < 0 or right > view_image.shape[1] or bottom > view_image.shape[0]
            or right <= left or bottom <= top or width <= 0 or height <= 0):
        raise ValueError("Native crop is empty or outside the LynxView capture")
    # Preserve int truncation and INTER_CUBIC, including fractional rectangles.
    return cv2.resize(view_image[top:bottom, left:right], (width, height), interpolation=cv2.INTER_CUBIC)


def compare_native_pixels(actual, baseline):
    # Follow integration_test/test_script/lib/test_runner/mixin/img_diff_mixin.py.
    # Use the original backend versions, not a similar JS/Web comparator.
    if version("opencv-python") != "4.12.0.88" or version("numpy") != "2.2.6":
        raise RuntimeError("Native pixel comparison requires the original pinned backend versions")
    for image in (actual, baseline):
        if (not isinstance(image, np.ndarray) or image.dtype != np.uint8
                or image.ndim != 3 or image.shape[2] != 3 or image.size == 0):
            raise ValueError("Native pixel comparison requires nonempty uint8 BGR images")
    baseline_gray = cv2.cvtColor(baseline, cv2.COLOR_BGR2GRAY)
    actual_gray = cv2.cvtColor(actual, cv2.COLOR_BGR2GRAY)
    if baseline_gray.shape != actual_gray.shape:
        raise ValueError("Native baseline and capture dimensions differ")
    mask = cv2.absdiff(baseline_gray, actual_gray) > int(0.1 * 255)
    mismatch_rate = float(np.sum(mask) / baseline_gray.size)
    if mismatch_rate > 0.01:
        raise NativePixelMismatch(mismatch_rate)
    return mismatch_rate
