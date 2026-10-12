"""Record signature differences without accepting changed application payloads."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def identity(path):
    path = Path(path)
    digest = hashlib.sha256()
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate APK entries cannot establish payload identity")
        for name in sorted(names):
            # APK signing blocks are outside the ZIP entries. v1 signature
            # metadata may differ, while classes, resources and fixtures may not.
            if name.upper().startswith("META-INF/") and (
                name.upper() == "META-INF/MANIFEST.MF"
                or name.upper().endswith((".SF", ".RSA", ".DSA", ".EC"))
            ):
                continue
            encoded = name.encode("utf-8")
            content = archive.read(name)
            digest.update(len(encoded).to_bytes(8, "big"))
            digest.update(encoded)
            digest.update(len(content).to_bytes(8, "big"))
            digest.update(content)
    return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "payloadSha256": digest.hexdigest()}


def compare(before, after):
    before, after = identity(before), identity(after)
    return {"before": before, "after": after, "byteIdentical": before["sha256"] == after["sha256"], "payloadIdentical": before["payloadSha256"] == after["payloadSha256"]}


if __name__ == "__main__":
    before, after, destination = sys.argv[1:]
    result = compare(before, after)
    Path(destination).write_text(json.dumps(result, indent=2) + "\n")
    if not result["payloadIdentical"]:
        raise SystemExit("Original control APK payload changed; comparison is invalid")
    print(json.dumps(result))
