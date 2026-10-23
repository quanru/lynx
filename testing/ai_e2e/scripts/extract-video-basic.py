"""Replay the complete original VideoBasic callback without UI or model calls.

This is a source contract inventory, not a runnable device migration. Preserve
core wait_for_equal separately from video_utils.wait_until: their defaults and
failure read/screenshot behavior are not interchangeable.
"""
import ast
import json
import re
import sys
from types import SimpleNamespace

data = json.load(sys.stdin)
source = data["source"]
tree = ast.parse(source)
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
assert [node.name for node in functions] == ["run"]
events = []
parser = next(node for node in ast.parse(data["utils"]).body if isinstance(node, ast.FunctionDef) and node.name == "parse_current_time")
parser_namespace = {"re": re}
exec(compile(ast.Module(body=[parser], type_ignores=[]), "original-video-utils", "exec"), parser_namespace)


class View:
    def get_by_test_tag(self, tag):
        return SimpleNamespace(tag=tag)


class Video:
    def get_lynxview(self, test):
        return view

    def click(self, actual, tag):
        assert actual is view
        events.append(["click", tag])

    def wait_for_count_at_least(self, test, actual, key, value, timeout=10):
        assert actual is view
        events.append(["video-wait", {"tag": "event-counts", "countAtLeast": {"key": key, "value": value}, "timeoutMs": timeout * 1000}])

    def wait_for_contains(self, test, actual, tag, value, timeout=20):
        assert actual is view
        events.append(["video-wait", {"tag": tag, "contains": value, "timeoutMs": timeout * 1000}])

    def wait_for_text(self, test, actual, tag, value, timeout=20):
        assert actual is view
        events.append(["video-wait", {"tag": tag, "equal": value, "timeoutMs": timeout * 1000}])

    def wait_until(self, test, actual, tag, predicate, message, timeout=20):
        assert actual is view
        node = next(node for node in ast.walk(tree) if isinstance(node, ast.Lambda) and node.lineno == predicate.__code__.co_firstlineno)
        samples = ["0", "0.1", "1"] if tag == "firstframe-duration" else ["0.0 / 10.0", "0.1 / 10.0", "1.9 / 10.0", "2.0 / 10.0", "4.9 / 10.0", "5.0 / 10.0", "5.9 / 10.0", "6.0 / 10.0"]
        events.append(["video-predicate", {"tag": tag, "predicate": ast.get_source_segment(source, node), "message": message, "timeoutMs": timeout * 1000, "samples": [[value, predicate(value)] for value in samples]}])

    parse_current_time = staticmethod(parser_namespace["parse_current_time"])

    def assert_count_equals(self, actual, key, value):
        assert actual is view
        events.append(["immediate", {"tag": "event-counts", "countEquals": {"key": key, "value": value}}])

    def capture_screenshot(self, test, actual, suffix):
        assert actual is view
        events.append(["screenshot", suffix])


class Test:
    def start_step(self, message):
        events.append(["section", message])

    def wait_for_equal(self, message, element, prop, expected, timeout=10):
        assert prop == "text"
        events.append(["core-wait", {"tag": element.tag, "equal": expected, "timeoutMs": timeout * 1000, "message": message}])


view = View()
namespace = {"video_utils": Video(), "time": SimpleNamespace(sleep=lambda seconds: events.append(["wait", seconds * 1000]))}
exec(compile(ast.Module(body=functions, type_ignores=[]), "original-video-basic", "exec"), namespace)
namespace["run"](Test())
print(json.dumps(events))
