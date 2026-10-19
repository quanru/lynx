import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


timing = load("original_timing", HERE / "original-timing.py")
results = load("original_results", HERE.parent / "integration_test/test_script/lib/test_runner/mixin/result_mixin.py")


class Clock:
    def __init__(self):
        self.value = 0

    def __call__(self):
        return self.value

    def advance(self, milliseconds):
        self.value += milliseconds * 1_000_000


class Case:
    def __init__(self, name="Event", function=lambda *args, **kwargs: None):
        self.name = name
        self.attr = {"category": "core"}
        self.run = function


class OriginalTimingTest(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.observer = timing.TimingObserver("android", "a" * 40, "pair-1-before", "core", self.clock)

        class Result(results.ResultMixin):
            pass

        class Runner:
            def __init__(self, owner):
                self._test = owner
                self._cases = []

            def add_case(self, case):
                self._cases.append(case)
                return "collection-return"

        self.Result, self.Runner = Result, Runner
        self.owner = Result()
        self.runner = Runner(self.owner)
        self.observer.install(Result, Runner)

    def tearDown(self):
        if not self.observer.closed:
            self.observer.finish("failure")

    def register(self, case=None):
        case = case or Case()
        self.assertEqual(self.runner.add_case(case), "collection-return")
        return case

    def complete(self, status=results.TestCaseStatus.SUCCESS):
        self.owner.update_test_result("Event", status)

    def test_primary_includes_original_restart_and_waits(self):
        case = self.register(Case(function=lambda *args: self.clock.advance(100)))
        self.owner.add_test_result("Event", 0)
        self.clock.advance(3000)  # original restart outside the case body's try
        self.clock.advance(5000)  # original pre-Exec wait
        self.clock.advance(2000)  # original post-open-card wait
        case.run(self.owner, "android")
        self.complete()
        evidence = self.observer.finish("success")
        record = evidence["attempts"][0]
        self.assertEqual(record["durationMs"], 10100)
        self.assertEqual(record["bodyCalls"][0]["durationMs"], 100)
        self.assertEqual(record["caseName"], "core/Event")
        self.assertEqual(evidence["collectedCases"], ["core/Event"])
        self.assertEqual(evidence["observerErrors"], [])

    def test_body_preserves_arguments_and_return(self):
        sentinel = object()
        calls = []
        case = self.register(Case(function=lambda *args, **kwargs: (calls.append((args, kwargs)), sentinel)[1]))
        self.owner.add_test_result(name="Event", max_retry_time=0)
        self.assertIs(case.run(self.owner, "android", special=42), sentinel)
        self.assertEqual(calls, [((self.owner, "android"), {"special": 42})])
        self.complete()

    def test_body_preserves_exception_instance_and_recovery_calls(self):
        error = OSError("original failure")
        count = []

        def body(*args):
            self.clock.advance(25)
            count.append(1)
            if len(count) == 1:
                raise error
            return 42

        case = self.register(Case(function=body))
        self.owner.add_test_result("Event", 0)
        with self.assertRaises(OSError) as caught:
            case.run(self.owner, "android")
        self.assertIs(caught.exception, error)
        self.clock.advance(3000)
        self.assertEqual(case.run(self.owner, "android"), 42)
        self.complete()
        attempt = self.observer.finish("success")["attempts"][0]
        self.assertEqual(attempt["durationMs"], 3050)
        self.assertEqual([body["status"] for body in attempt["bodyCalls"]], ["failure", "success"])
        self.assertEqual([body["call"] for body in attempt["bodyCalls"]], [1, 2])

    def test_attempts_do_not_depend_on_failure_only_exec_list(self):
        self.register()
        self.owner.add_test_result("Event", 1)
        self.clock.advance(10)
        self.owner.update_test_result("Event", results.TestCaseStatus.FAIL, {"status": results.TestCaseStatus.FAIL})
        self.owner.add_test_result("Event", 1)
        self.clock.advance(20)
        self.complete()
        attempts = self.observer.finish("success")["attempts"]
        self.assertEqual([item["attempt"] for item in attempts], [1, 2])
        self.assertEqual([item["status"] for item in attempts], ["failure", "success"])
        self.assertEqual(len(self.owner.get_test_result()["test_result"]["Event"].exec_list), 1)

    def test_framework_retry_new_owner_keeps_global_attempt_number(self):
        self.register()
        self.owner.add_test_result("Event")
        self.complete()
        other = self.Result()
        self.Runner(other).add_case(Case())
        other.add_test_result("Event")
        other.update_test_result("Event", results.TestCaseStatus.SUCCESS)
        self.assertEqual([item["attempt"] for item in self.observer.finish("success")["attempts"]], [1, 2])

    def test_case_interrupted_before_body_is_retained(self):
        self.register()
        self.owner.add_test_result("Event")
        self.clock.advance(123)
        attempt = self.observer.finish("failure")["attempts"][0]
        self.assertTrue(attempt["interrupted"])
        self.assertEqual(attempt["status"], "interrupted")
        self.assertEqual(attempt["durationMs"], 123)
        self.assertEqual(attempt["bodyCalls"], [])

    def test_noncustom_case_run_is_observed(self):
        class PixelCase(Case):
            def __init__(self):
                self.name = "Image"
                self.attr = {"category": "core", "type": "noncustom"}

            def run(self, *args):
                return "original pixel result"

        case = self.register(PixelCase())
        self.owner.add_test_result("Image")
        self.assertEqual(case.run(self.owner, "android"), "original pixel result")
        self.owner.update_test_result("Image", results.TestCaseStatus.SUCCESS)
        self.assertEqual(len(self.observer.finish("success")["attempts"][0]["bodyCalls"]), 1)

    def test_worker_thread_uses_installed_hooks(self):
        case = self.register()

        def run():
            self.owner.add_test_result("Event")
            case.run(self.owner, "android")
            self.complete()

        worker = threading.Thread(target=run)
        worker.start()
        worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.observer.finish("success")["attempts"][0]["status"], "success")

    def test_daemon_timeout_marks_live_body_interrupted(self):
        entered, release = threading.Event(), threading.Event()

        def body(*args):
            entered.set()
            release.wait(2)

        case = self.register(Case(function=body))
        self.owner.add_test_result("Event")
        worker = threading.Thread(target=case.run, args=(self.owner, "android"), daemon=True)
        worker.start()
        self.assertTrue(entered.wait(2))
        evidence = self.observer.finish("failure")
        release.set()
        worker.join(2)
        self.assertEqual(evidence["attempts"][0]["bodyCalls"][0]["status"], "interrupted")

    def test_register_does_not_double_wrap_existing_cases(self):
        case = self.register()
        self.register(Case("Other"))
        self.owner.add_test_result("Event")
        case.run(self.owner, "android")
        self.complete()
        self.assertEqual(len(self.observer.finish("success")["attempts"][0]["bodyCalls"]), 1)

    def test_observation_error_does_not_change_source_behavior(self):
        self.owner.add_test_result("NotCollected", 0)
        self.assertIn("NotCollected", self.owner._test_result)
        evidence = self.observer.finish("success")
        self.assertEqual(evidence["observerErrors"], ["ValueError"])
        self.assertEqual(evidence["attempts"], [])

    def test_setup_failure_has_no_invented_case(self):
        evidence = self.observer.finish("failure")
        self.assertEqual(evidence["attempts"], [])
        self.assertEqual(evidence["collectedCases"], [])

    def test_methods_are_restored(self):
        self.observer.finish("success")
        self.assertIs(self.Result.add_test_result, results.ResultMixin.add_test_result)

    def test_original_update_exception_is_not_swallowed(self):
        error = ValueError("original update error")
        self.observer.finish("success")

        class BrokenResult(self.Result):
            def update_test_result(self, name, *args, **kwargs):
                raise error

        self.observer = timing.TimingObserver("android", "a" * 40, "pair-1", "core", self.clock)
        self.observer.install(BrokenResult, self.Runner)
        owner = BrokenResult()
        self.Runner(owner).add_case(Case())
        owner.add_test_result("Event")
        with self.assertRaises(ValueError) as caught:
            owner.update_test_result("Event", results.TestCaseStatus.SUCCESS)
        self.assertIs(caught.exception, error)
        self.assertEqual(self.observer.finish("failure")["attempts"][0]["status"], "interrupted")

    def test_cli_uses_unchanged_management_entry_and_preserves_exit(self):
        self.observer.finish("success")
        exit_error = SystemExit(7)
        expected_command = ["manage.py", "runtest", "android_test.core"]

        def manage(path, run_name):
            self.assertEqual(path, "manage.py")
            self.assertEqual(run_name, "__main__")
            self.assertEqual(sys.argv, expected_command)
            owner = self.Result()
            runner = self.Runner(owner)
            case = Case()
            runner.add_case(case)

            def run():
                owner.add_test_result("Event")
                case.run(owner, "android")
                owner.update_test_result("Event", results.TestCaseStatus.FAIL)

            worker = threading.Thread(target=run)
            worker.start()
            worker.join(2)
            raise exit_error

        modules = {"lib.test_runner.mixin.result_mixin": types.SimpleNamespace(ResultMixin=self.Result),
                   "lib.test_runner.test_runner": types.SimpleNamespace(TestRunner=self.Runner)}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            argv = ["original-timing.py", "--output", str(output), "--platform", "android",
                    "--source-sha", "a" * 40, "--session-id", "pair-1", "--suite", "core",
                    "--", *expected_command]
            with patch.object(sys, "argv", argv), patch.dict(os.environ, {"platform": "android", "test_case_name": ""}), \
                    patch.object(timing.importlib.metadata, "version", return_value="0.0.15"), \
                    patch.object(timing.importlib, "import_module", side_effect=modules.__getitem__), \
                    patch.object(timing.runpy, "run_path", side_effect=manage):
                with self.assertRaises(SystemExit) as caught:
                    timing.main()
                self.assertIs(caught.exception, exit_error)
                self.assertIs(sys.argv, argv)
            evidence = json.loads(output.read_text())
            self.assertEqual(evidence["processOutcome"], "failure")
            self.assertEqual(evidence["attempts"][0]["status"], "failure")
            self.assertEqual(evidence["observerErrors"], [])


if __name__ == "__main__":
    unittest.main()
