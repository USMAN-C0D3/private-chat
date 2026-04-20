from __future__ import annotations

import os
from pathlib import Path


def load_local_env() -> None:
    base_dir = Path(__file__).resolve().parent
    for filename in (".env", ".env.local"):
        env_path = base_dir / filename
        if not env_path.exists() or not env_path.is_file():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            normalized_key = key.strip()
            if not normalized_key:
                continue

            normalized_value = value.strip().strip('"').strip("'")
            os.environ.setdefault(normalized_key, normalized_value)
