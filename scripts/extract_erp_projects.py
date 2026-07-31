"""Extract ERP project rows from xlsx to raw JSON for erpProjectImport.ts."""
from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "tmp" / "2026.07.31.xlsx"
OUT = ROOT / "src" / "data" / "erpProjects20260731.raw.json"


def conv(value):
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m-%d")
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return value


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        print(f"Source not found: {src}", file=sys.stderr)
        return 1

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb.active
    header = None
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            header = [str(c).strip() if c else "" for c in row]
            continue
        if not any(c is not None and str(c).strip() != "" for c in row):
            continue
        values = [conv(c) for c in row]
        rows.append(
            {
                "no": values[0],
                "projectCode": values[1],
                "name": values[2],
                "startDate": values[3],
                "endDate": values[4],
                "erpDivision": values[5],
                "erpType": values[6],
                "clientName": values[7],
                "teamName": values[8],
                "contractAmount": values[9],
                "marketScope": values[10],
            }
        )
    wb.close()

    payload = {
        "sourceFile": str(src.name),
        "extractedAt": datetime.date.today().isoformat(),
        "rowCount": len(rows),
        "rows": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
