import csv
import io
from pathlib import Path


ENCODINGS = ("utf-8-sig", "utf-8", "cp932", "shift_jis")


def decode_csv(data: bytes) -> tuple[str, str]:
    errors: list[str] = []
    for encoding in ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError as exc:
            errors.append(f"{encoding}: {exc}")
    raise UnicodeError("CSV encoding could not be detected: " + "; ".join(errors))


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str | None]], str]:
    text, encoding = decode_csv(path.read_bytes())
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if not reader.fieldnames:
        raise ValueError(f"CSV has no header row: {path}")
    rows = [
        {
            (key or "").strip(): (value.strip() if value and value.strip() else None)
            for key, value in row.items()
            if key is not None
        }
        for row in reader
    ]
    return [field.strip() for field in reader.fieldnames], rows, encoding
