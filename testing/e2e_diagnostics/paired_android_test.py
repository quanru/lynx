"""Model-free orchestration checks; no Android device or model is contacted."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("paired-android.sh")


class PairedAndroidTest(unittest.TestCase):
    def run_side(self, side, fail_core=False, corrupt_apk=False):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            control = root / "control"
            control.mkdir()
            (control / "paired.apk").write_text("same-signed-apk")
            for field in ("serial", "fingerprint", "size", "density"):
                (control / f"device-{field}.txt").write_text("identity\n")
            (control / "device-density.txt").write_text("Physical density: 420\nOverride density: 320\n")
            density = root / "density.txt"
            density.write_text("Physical density: 420\n")
            source = root / "source"
            runner = source / "testing/integration_test/test_script/lib/test_runner/test_runner.py"
            runner.parent.mkdir(parents=True)
            runner.write_text("self._test.device.shell_command('wm density 320')\n"
                              "self._test.log_info(self._test.device.shell_command('wm density'))\n"
                              "self._test.device.shell_command('wm density reset')\n")
            (source / "testing/ai_e2e").mkdir(parents=True)
            binaries = root / "bin"
            binaries.mkdir()
            mock = '''#!/usr/bin/env python3
import os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALLS"], "a") as stream:
    stream.write(name + " " + " ".join(args) + "\\n")
if name == "git" and "rev-parse" in args:
    print("a" * 40)
elif name == "adb":
    if args == ["shell", "wm", "density"]:
        print(pathlib.Path(os.environ["DENSITY"]).read_text(), end="")
    elif args == ["shell", "wm", "density", "320"]:
        pathlib.Path(os.environ["DENSITY"]).write_text("Physical density: 420\\nOverride density: 320\\n")
    elif args == ["get-serialno"] or args[:2] == ["shell", "getprop"] or args == ["shell", "wm", "size"]:
        print("identity")
    elif args[:3] == ["shell", "pm", "path"]:
        print("package:/data/app/base.apk")
    elif args[0] == "pull":
        pathlib.Path(args[2]).write_text("corrupt" if os.environ["CORRUPT"] == "1" else "same-signed-apk")
elif name == "python3" and "--suite" in args:
    print("Override density: 320")
    pathlib.Path(os.environ["DENSITY"]).write_text("Physical density: 420\\n")
    if args[args.index("--suite") + 1] == "core" and os.environ["FAIL_CORE"] == "1":
        sys.exit(7)
'''
            # Use the real interpreter in mock shebangs, avoiding PATH recursion.
            import sys
            for name in ("adb", "git", "python3", "node"):
                path = binaries / name
                path.write_text(mock.replace("#!/usr/bin/env python3", f"#!{sys.executable}", 1))
                path.chmod(0o755)
            calls = root / "calls.txt"
            environment = dict(os.environ, PATH=f"{binaries}:{os.environ['PATH']}",
                               CONTROL_DIR=str(control), SOURCE_DIR=str(source),
                               HARNESS_DIR=str(root / "harness"), PAIR_ORDER="original-first",
                               SAMPLE_ID="1", GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="1",
                               CALLS=str(calls), FAIL_CORE=str(int(fail_core)),
                               DENSITY=str(density),
                               CORRUPT=str(int(corrupt_apk)))
            result = subprocess.run(["bash", str(SCRIPT), side], env=environment,
                                    capture_output=True, text=True)
            return result, calls.read_text(), {
                str(path.relative_to(control)): path.read_text()
                for path in control.rglob("*.txt")
            }

    def test_original_runs_both_suites_and_preserves_failure(self):
        result, calls, evidence = self.run_side("original", fail_core=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("--suite core -- manage.py runtest android_test.core", calls)
        self.assertIn("--suite xelement -- manage.py runtest android_test.xelement", calls)
        self.assertEqual(evidence["original/core-exit.txt"], "7\n")
        self.assertEqual(evidence["original/xelement-exit.txt"], "0\n")
        self.assertIn("after-installed.apk", calls)
        self.assertEqual(evidence["original/before-density.txt"], "Physical density: 420\nOverride density: 320\n")
        self.assertEqual(evidence["original/after-density.txt"], "Physical density: 420\n")

    def test_original_density_reset_is_expected_cleanup(self):
        result, _, evidence = self.run_side("original")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(evidence["original/core-after-density.txt"], "Physical density: 420\n")
        self.assertEqual(evidence["original/xelement-after-density.txt"], "Physical density: 420\n")

    def test_migrated_runs_full_project_and_releases_forward(self):
        result, calls, evidence = self.run_side("migrated")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("node scripts/run-ci.mjs --project android-explorer", calls)
        self.assertIn("adb forward --remove tcp:18901", calls)
        self.assertIn("after-installed.apk", calls)
        self.assertEqual(evidence["migrated/entry-density.txt"], "Physical density: 420\n")
        self.assertEqual(evidence["migrated/before-density.txt"], "Physical density: 420\nOverride density: 320\n")
        self.assertEqual(evidence["migrated/after-density.txt"], evidence["migrated/before-density.txt"])

    def test_changed_installed_apk_blocks_execution(self):
        result, calls, _ = self.run_side("original", corrupt_apk=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("--suite", calls)


if __name__ == "__main__":
    unittest.main()
