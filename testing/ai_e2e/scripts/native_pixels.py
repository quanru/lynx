"""Original native grayscale comparison; no Appium, baseline update or retry."""
from importlib.metadata import version

import cv2
import numpy as np


class NativePixelMismatch(RuntimeError):
    def __init__(self, mismatch_rate):
        self.mismatch_rate = mismatch_rate
        super().__init__(f"Native image comparison failed: mismatch rate {mismatch_rate}")


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
