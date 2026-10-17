from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from .config import SOURCES, SourceDefinition


def download_source(
    source: SourceDefinition, raw_dir: Path, force: bool = False
) -> tuple[Path, str]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    destination = raw_dir / source.filename
    if destination.exists() and not force:
        return destination, datetime.fromtimestamp(
            destination.stat().st_mtime, timezone.utc
        ).isoformat()

    request = Request(
        source.url,
        headers={"User-Agent": "tokyo-reuse-data/0.1 (local open-data processing)"},
    )
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        with urlopen(request, timeout=90) as response, temporary.open("wb") as output:
            if response.status != 200:
                raise OSError(f"Download failed with HTTP {response.status}: {source.source_id}")
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    return destination, datetime.now(timezone.utc).isoformat()


def download_all(raw_dir: Path, force: bool = False) -> dict[str, tuple[Path, str]]:
    return {
        source.source_id: download_source(source, raw_dir, force)
        for source in SOURCES
    }
