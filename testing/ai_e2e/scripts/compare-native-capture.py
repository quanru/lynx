"""Compare one bound native capture, retaining original pixels on failure."""
import base64
import json
from pathlib import Path
import sys

import cv2
import numpy as np

from native_pixels import (compare_native_pixels, crop_native_view, crop_native_element,
                           native_element_bounds)


def compare_capture(payload, baseline_path, output_dir):
    # The caller chooses a source-controlled baseline, never a captured replacement.
    frame_bytes = base64.b64decode(payload["frame"], validate=True)
    frame = cv2.imdecode(np.frombuffer(frame_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    baseline = cv2.imread(str(baseline_path), cv2.IMREAD_COLOR)
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "frame.jpeg").write_bytes(frame_bytes)
    (directory / "geometry.json").write_text(json.dumps({key: value for key, value in payload.items()
                                                        if key != "frame"}) + "\n")
    actual = crop_native_view(frame, payload["rect"], payload["platform"])
    if payload.get("elementPadding") is not None:
        bounds = native_element_bounds(payload["rect"], payload["bodyPadding"],
                                       payload["elementPadding"], payload["platform"])
        actual = crop_native_element(actual, bounds, payload["platform"])
    if not cv2.imwrite(str(directory / "actual.png"), actual):
        raise RuntimeError("Could not preserve native comparison image")
    if baseline is not None and not cv2.imwrite(str(directory / "baseline.png"), baseline):
        raise RuntimeError("Could not preserve native baseline evidence")
    return compare_native_pixels(actual, baseline)


if __name__ == "__main__":
    rate = compare_capture(json.load(sys.stdin), sys.argv[1], sys.argv[2])
    print(json.dumps({"mismatchRate": rate}))
