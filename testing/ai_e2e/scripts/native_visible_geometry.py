"""Original visible-view geometry in WDA points; no image or model access."""
import json
import math
import sys


def visible_element_rect(view, body_padding, element_padding):
    x, y, width, height = (view[key] for key in ("x", "y", "width", "height"))
    values = [x, y, width, height, *body_padding, *element_padding]
    if (len(body_padding) != 8 or len(element_padding) != 8
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not math.isfinite(value) for value in values)
            or min(width, height, body_padding[2] - body_padding[0],
                   body_padding[5] - body_padding[1], element_padding[2] - element_padding[0],
                   element_padding[5] - element_padding[1]) <= 0):
        raise ValueError("Invalid visible native geometry")
    body_width, body_height = body_padding[2] - body_padding[0], body_padding[5] - body_padding[1]
    width_scale, height_scale = width / body_width, height / body_height
    rated_x = (element_padding[0] - x / width_scale) / body_width
    rated_y = (element_padding[1] - y / height_scale) / body_height
    rated_width = (element_padding[2] - element_padding[0]) / body_width
    rated_height = (element_padding[5] - element_padding[1]) / body_height
    result = dict(x=round(x + width * rated_x, 2), y=round(y + height * rated_y, 2),
                  width=round(width * rated_width, 2), height=round(height * rated_height, 2))
    if any(not math.isfinite(value) for value in result.values()) or min(result["width"], result["height"]) <= 0:
        raise ValueError("Invalid normalized visible geometry")
    return result


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    print(json.dumps(visible_element_rect(payload["view"], payload["bodyPadding"], payload["elementPadding"])))
