"""Replay complete original playback callbacks, recording every operation.

Only sampling guards are instrumented, leaving their original conditions and
failure branches intact. No device, fixture action hook, or model is invoked.
"""
import ast
import json
import re
import sys
from types import SimpleNamespace

data = json.load(sys.stdin)
tree = ast.parse(data["source"])
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
assert [node.name for node in functions] == ["run"]
events = []
samples = iter(data.get("samples", ["1.0 / 10.0", "5.0 / 10.0", "timeupdate=30"]))
helper_tree = ast.parse(data["utils"])
parsers = [node for node in helper_tree.body if isinstance(node, ast.FunctionDef) and node.name in ["parse_count", "parse_current_time"]]
parser_namespace = {"re": re}
exec(compile(ast.Module(body=parsers, type_ignores=[]), "original-video-parsers", "exec"), parser_namespace)


class GuardRecorder(ast.NodeTransformer):
    def visit_If(self, node):
        self.generic_visit(node)
        record = ast.Expr(value=ast.Call(func=ast.Name(id="record_guard", ctx=ast.Load()), args=[ast.Constant(value=ast.unparse(node.test))], keywords=[]))
        return [ast.copy_location(record, node), node]


class View:
    def get_by_test_tag(self, tag):
        return SimpleNamespace(tag=tag)


class Video:
    def get_lynxview(self, test):
        return view

    def click(self, actual, tag):
        assert actual is view
        events.append(["click", tag])

    def wait_for_text(self, test, actual, tag, value, timeout=20):
        assert actual is view
        events.append(["video", {"tag": tag, "equal": value, "timeoutMs": timeout * 1000}])

    def wait_for_contains(self, test, actual, tag, value, timeout=20):
        assert actual is view
        events.append(["video", {"tag": tag, "contains": value, "timeoutMs": timeout * 1000}])

    def wait_for_count_at_least(self, test, actual, key, value, timeout=10):
        assert actual is view
        events.append(["video", {"tag": "event-counts", "countAtLeast": {"key": key, "value": value}, "timeoutMs": timeout * 1000}])

    def wait_until(self, test, actual, tag, predicate, message, timeout=20):
        assert actual is view
        node = next(node for node in ast.walk(tree) if isinstance(node, ast.Lambda) and node.lineno == predicate.__code__.co_firstlineno)
        events.append(["predicate", {"tag": tag, "condition": ast.unparse(node.body), "message": message, "timeoutMs": timeout * 1000}])

    def assert_count_equals(self, actual, key, value):
        assert actual is view
        events.append(["video", {"tag": "event-counts", "countEquals": {"key": key, "value": value}, "immediate": True}])

    def assert_count_at_most(self, actual, key, value):
        assert actual is view
        events.append(["video", {"tag": "event-counts", "countAtMost": {"key": key, "value": value}, "immediate": True}])

    def capture_screenshot(self, test, actual, suffix):
        assert actual is view
        events.append(["capture", suffix])

    def get_text(self, actual, tag):
        assert actual is view
        events.append(["sample", tag])
        return next(samples)

    parse_count = staticmethod(parser_namespace["parse_count"])
    parse_current_time = staticmethod(parser_namespace["parse_current_time"])


class Test:
    def start_step(self, message):
        events.append(["section", message])

    def wait_for_equal(self, message, element, prop, value, timeout=10):
        assert prop == "text"
        events.append(["core", {"tag": element.tag, "text": value, "timeoutMs": timeout * 1000, "message": message}])


view = View()
module = GuardRecorder().visit(ast.Module(body=functions, type_ignores=[]))
ast.fix_missing_locations(module)
namespace = {"video_utils": Video(), "time": SimpleNamespace(sleep=lambda seconds: events.append(["sleep", seconds * 1000])), "record_guard": lambda condition: events.append(["guard", condition])}
exec(compile(module, "original-video-playback", "exec"), namespace)
namespace["run"](Test())
print(json.dumps(events))
