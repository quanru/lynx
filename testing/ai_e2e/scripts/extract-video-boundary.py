"""Replay unchanged original run/helpers without devices, models or imports."""
import ast
import json
import sys
from types import SimpleNamespace

data = json.load(sys.stdin)
tree = ast.parse(data["source"])
events = []


class Video:
    def get_lynxview(self, test):
        return "view"

    def click(self, view, tag):
        events.append(["click", tag])

    def wait_for_text(self, test, view, tag, expected, timeout=20):
        events.append(["assert", {"tag": tag, "equal": expected, "timeoutMs": timeout * 1000}])

    def wait_for_contains(self, test, view, tag, expected, timeout=20):
        events.append(["assert", {"tag": tag, "contains": expected, "timeoutMs": timeout * 1000}])

    def wait_for_count_at_least(self, test, view, key, expected, timeout=10):
        events.append(["assert", {"tag": "event-counts", "countAtLeast": {"key": key, "value": expected}, "timeoutMs": timeout * 1000}])

    def wait_until(self, test, view, tag, predicate, message, timeout=20):
        assert tag == "last-error"
        for value in ["none", "", ":", "error:detail", "none:", "error"]:
            assert predicate(value) == (value != "none" and ":" in value)
        events.append(["assert", {"tag": tag, "errorDetails": True, "timeoutMs": timeout * 1000}])

    def assert_text_contains(self, view, tag, expected):
        events.append(["assert", {"tag": tag, "contains": expected, "immediate": True}])

    def assert_text_not_contains(self, view, tag, expected):
        events.append(["assert", {"tag": tag, "notContains": expected, "immediate": True}])

    def assert_text_occurrences(self, view, tag, expected, count):
        events.append(["assert", {"tag": tag, "occurrences": {"text": expected, "count": count}, "immediate": True}])

    def capture_screenshot(self, test, view, suffix):
        events.append(["screenshot", suffix])


functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
assert {node.name for node in functions} == {"run", "assert_failed_callback", "assert_bridge_failed_callback"}
namespace = {
    "video_utils": Video(),
    "os": SimpleNamespace(environ={"platform": data["platform"]}),
    "time": SimpleNamespace(sleep=lambda seconds: events.append(["wait", seconds * 1000])),
}
exec(compile(ast.Module(body=functions, type_ignores=[]), "original-video-boundary", "exec"), namespace)
namespace["run"](SimpleNamespace(start_step=lambda *args: None))
print(json.dumps(events))
