from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download, validate, and export the initial Tokyo reuse dataset."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Project folder containing raw/, output/, and reports/.",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download all official source files, replacing existing raw files.",
    )
    args = parser.parse_args()
    result = run_pipeline(args.project_root.resolve(), force_download=args.force_download)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
