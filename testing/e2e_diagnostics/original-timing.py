#!/usr/bin/env python3
"""Observe the unchanged original runner in its normal worker threads."""

import argparse
import functools
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import runpy
import sys
import threading
import time


class TimingObserver:
    def __init__(self, platform, source_sha, session_id, suite, clock=time.monotonic_ns):
        self.clock = clock
        self.started = clock()
        self.lock = threading.RLock()
        self.closed = False
        self.active = {}
        self.case_names = {}
        self.counts = {}
        self.attempts = []
        self.errors = []
        self.restores = []
        self.identity = dict(schemaVersion=1, platform=platform, sourceSha=source_sha,
                             sessionId=session_id, suite=suite, clock="monotonic_ns")

    def observe(self, function, *args):
        # An observation error invalidates the evidence, not the original test.
        try:
            with self.lock:
                if not self.closed:
                    return function(*args)
        except Exception as error:
            self.errors.append(type(error).__name__)

    def _finish(self, record, status, error=None):
        record["durationMs"] = (self.clock() - record.pop("_start")) / 1_000_000
        record["status"] = status
        if error is not None:
            record["errorType"] = type(error).__name__

    def begin(self, owner, name):
        key = (id(owner), name)
        if key in self.active:
            self.end(owner, name, "interrupted")
        case_name = self.case_names.get(key)
        if case_name is None:
            raise ValueError("Uncollected case cannot acquire timing evidence")
        self.counts[case_name] = self.counts.get(case_name, 0) + 1
        record = dict(caseName=case_name, attempt=self.counts[case_name],
                      status="running", interrupted=False, bodyCalls=[], _start=self.clock())
        self.attempts.append(record)
        self.active[key] = record

    def end(self, owner, name, status, error=None):
        record = self.active.pop((id(owner), name), None)
        if record is None:
            raise ValueError("Case completion has no observed start")
        for body in record["bodyCalls"]:
            if "_start" in body:
                self._finish(body, "interrupted")
        self._finish(record, status, error)
        record["interrupted"] = status == "interrupted"

    def body_begin(self, owner, name):
        record = self.active[(id(owner), name)]
        body = dict(call=len(record["bodyCalls"]) + 1, status="running", _start=self.clock())
        record["bodyCalls"].append(body)
        return body

    def body_end(self, body, status, error):
        if body is not None and "_start" in body:
            self._finish(body, status, error)

    def register(self, runner):
        for case in runner._cases:
            key = (id(runner._test), case.name)
            category = case.attr["category"]
            if category != self.identity["suite"]:
                raise ValueError("Collected case category does not match selected suite")
            self.case_names[key] = category + "/" + case.name
            if getattr(case, "_timing_observer", None) is self:
                continue
            original = case.run

            @functools.wraps(original)
            def body(*args, _original=original, _owner=runner._test, _name=case.name, **kwargs):
                token = self.observe(self.body_begin, _owner, _name)
                status, error = "success", None
                try:
                    return _original(*args, **kwargs)
                except BaseException as caught:
                    status, error = "failure", caught
                    raise
                finally:
                    self.observe(self.body_end, token, status, error)

            case.run = body
            case._timing_observer = self

    def install(self, result_class, runner_class):
        observer = self
        add = result_class.add_test_result
        update = result_class.update_test_result
        collect = runner_class.add_case

        @functools.wraps(add)
        def add_result(owner, name, *args, **kwargs):
            observer.observe(observer.begin, owner, name)
            try:
                return add(owner, name, *args, **kwargs)
            except BaseException as error:
                observer.observe(observer.end, owner, name, "interrupted", error)
                raise

        @functools.wraps(update)
        def update_result(owner, name, *args, **kwargs):
            try:
                result = update(owner, name, *args, **kwargs)
            except BaseException as error:
                observer.observe(observer.end, owner, name, "interrupted", error)
                raise
            status = args[0] if args else kwargs.get("status")
            value = getattr(status, "value", status)
            if value in ("success", "fail"):
                observer.observe(observer.end, owner, name, "success" if value == "success" else "failure")
            return result

        @functools.wraps(collect)
        def add_case(runner, *args, **kwargs):
            result = collect(runner, *args, **kwargs)
            observer.observe(observer.register, runner)
            return result

        for cls, name, replacement in ((result_class, "add_test_result", add_result),
                                       (result_class, "update_test_result", update_result),
                                       (runner_class, "add_case", add_case)):
            self.restores.append((cls, name, getattr(cls, name)))
            setattr(cls, name, replacement)

    def finish(self, outcome):
        with self.lock:
            if self.closed:
                raise RuntimeError("Observer already finalized")
            for record in self.active.values():
                for body in record["bodyCalls"]:
                    if "_start" in body:
                        self._finish(body, "interrupted")
                self._finish(record, "interrupted")
                record["interrupted"] = True
            self.active.clear()
            self.closed = True
            for cls, name, original in reversed(self.restores):
                setattr(cls, name, original)
            return {**self.identity, "durationMs": (self.clock() - self.started) / 1_000_000,
                    "processOutcome": outcome, "collectedCases": sorted(set(self.case_names.values())),
                    "attempts": self.attempts, "observerErrors": self.errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--platform", choices=("android", "ios"), required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--suite", choices=("core", "xelement", "sparkling"), required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not args.output.is_absolute() or args.output.exists():
        parser.error("--output must be an unused absolute path")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        parser.error("--source-sha must identify the verified source checkout")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", args.session_id):
        parser.error("--session-id must be a short nonsecret evidence identifier")
    expected = ["manage.py", "runtest", args.platform + "_test." + args.suite]
    if command != expected:
        parser.error("command must select exactly the declared original suite without extra runner flags")
    if os.environ.get("platform") != args.platform or os.environ.get("test_case_name"):
        parser.error("platform must match and test_case_name must be unset")
    if importlib.metadata.version("lynx-e2e-appium") != "0.0.15":
        parser.error("Only the inspected in-process lynx-e2e-appium 0.0.15 runner is supported")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(Path.cwd()))
    observer = TimingObserver(args.platform, args.source_sha, args.session_id, args.suite)
    outcome = "interrupted"
    previous_argv = sys.argv
    try:
        sys.argv = command
        result = importlib.import_module("lib.test_runner.mixin.result_mixin")
        runner = importlib.import_module("lib.test_runner.test_runner")
        observer.install(result.ResultMixin, runner.TestRunner)
        try:
            runpy.run_path("manage.py", run_name="__main__")
            outcome = "success"
        except SystemExit as error:
            outcome = "success" if error.code is None or error.code == 0 else "failure"
            raise
        except BaseException:
            outcome = "failure"
            raise
    finally:
        sys.argv = previous_argv
        evidence = observer.finish(outcome)
        # Exclusive creation prevents silently overwriting another suite/repeat.
        with args.output.open("x", encoding="utf-8") as stream:
            json.dump(evidence, stream, indent=2, allow_nan=False)
            stream.write("\n")


if __name__ == "__main__":
    main()
