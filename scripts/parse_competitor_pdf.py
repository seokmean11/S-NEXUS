#!/usr/bin/env python3
"""
경쟁사 PDF → 백만원 정규화 JSON (파일별 Zero-Omission 파싱).

사용:
  python scripts/parse_competitor_pdf.py --dir .data/nexus-drive/경쟁사분석/2024/전시사업
  python scripts/parse_competitor_pdf.py --dir ... --master-out master-competitor-data.json
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


REQUIRED_KEYS = [
    "revenue",
    "cogs",
    "gross_profit",
    "sga",
    "operating_profit",
    "net_income",
    "total_assets",
    "total_liabilities",
    "total_equity",
    "total_debt",
]


def round2(v: float) -> float:
    return round(v, 2)


def parse_num(s: str) -> float | None:
    cleaned = re.sub(r"[^\d.-]", "", s.replace(",", ""))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def normalize_company_key(name: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"(?:\(주\)|㈜|주식회사|\(유\))", "", name)).strip()


def extract_text(pdf_path: Path, max_pages: int = 40) -> str:
    if fitz is None:
        raise SystemExit("PyMuPDF 필요: pip install pymupdf")
    doc = fitz.open(pdf_path)
    parts: list[str] = []
    for i in range(min(len(doc), max_pages)):
        parts.append(doc.load_page(i).get_text("text"))
    doc.close()
    return "\n".join(parts)


def extract_company_name(text: str, file_name: str) -> str:
    cover = text[:8000]
    patterns = [
        r"(?:업\s*체\s*명|회\s*사\s*명|기\s*업\s*명)\s*[:：]?\s*(?:\(?(?:주|유|㈜)\)?\s*)?([가-힣A-Za-z0-9&·\s]{2,40})",
        r"\[([^\]]+)\]",
        r"주식회사\s+([가-힣A-Za-z0-9&]+)",
    ]
    for p in patterns:
        m = re.search(p, cover) or re.search(p, file_name)
        if m:
            label = m.group(1).strip()
            label = re.sub(r"감사보고서.*$|사업보고서.*$", "", label).strip()
            if len(label) >= 2:
                return label
    return Path(file_name).stem


def extract_fiscal_year(text: str, folder_year: int) -> int:
    head = text[:12000]
    for p in [
        r"(\d{4})년\s*0?1월\s*0?1일\s*부터\s*(\d{4})년\s*12월\s*31일\s*까지",
        r"(\d{4})년\s*12월\s*31일\s*현재",
        r"제\s*\d+\s*기[^\d]{0,12}(\d{4})\s*년",
    ]:
        m = re.search(p, head)
        if m:
            y = int(m.group(2) if m.lastindex and m.lastindex >= 2 and m.group(2) else m.group(1))
            if 2000 <= y <= 2100:
                return y
    years = [int(f"20{x}") for x in re.findall(r"20(\d{2})-12-31", head)]
    return max(years) if years else folder_year


def detect_unit(section: str) -> str:
    window = section[:400]
    if re.search(r"단\s*위\s*[:：]\s*백\s*만\s*원", window):
        return "백만원"
    if re.search(r"단\s*위\s*[:：]\s*천\s*원", window):
        return "천원"
    if re.search(r"단\s*위\s*[:：]\s*원(?![\s\S]{0,6}(?:천|백\s*만))", window):
        return "원"
    return ""


def raw_to_million(value: float, unit: str) -> float:
    if unit == "원":
        return round2(value / 1_000_000)
    if unit == "천원":
        return round2(value / 1_000)
    return round2(value)


def guardrail_unit(raw_revenue: float, unit: str) -> str:
    if unit:
        return unit
    abs_v = abs(raw_revenue)
    if abs_v >= 100_000_000:
        return "원"
    if abs_v >= 100_000:
        return "천원"
    return "백만원"


def pick_section(text: str, kind: str) -> str:
    if kind == "income":
        separate = re.search(r"별\s*도\s*손\s*익\s*계\s*산\s*서", text)
        generic = re.search(r"손\s*익\s*계\s*산\s*서", text)
        start = separate.start() if separate else (generic.start() if generic else -1)
    else:
        separate = re.search(r"별\s*도\s*재\s*무\s*상\s*태\s*표", text)
        generic = re.search(r"재\s*무\s*상\s*태\s*표", text)
        start = separate.start() if separate else (generic.start() if generic else -1)

    if start < 0:
        return ""
    return text[start : start + 12000]


LINE_PATTERNS: dict[str, list[str]] = {
    "revenue": [r"Ⅰ\.?\s*매출액", r"(?<![총])매출액"],
    "cogs": [r"Ⅱ\.?\s*매출원가", r"매출원가"],
    "gross_profit": [r"Ⅲ\.?\s*매출총이익", r"매출총이익"],
    "sga": [r"Ⅳ\.?\s*판매비", r"판매비(?:와|및)\s*(?:일반)?관리비"],
    "operating_profit": [r"Ⅴ\.?\s*영업", r"영업(?:손)?이익"],
    "net_income": [r"당기순(?:\(손\))?이익"],
    "total_assets": [r"자\s*산\s*총\s*계"],
    "total_liabilities": [r"부\s*채\s*총\s*계"],
    "total_equity": [r"자\s*본\s*총\s*계"],
    "short_term_debt": [r"단기차입금"],
    "long_term_debt": [r"장기차입금"],
    "current_portion_debt": [r"유동성장기부채"],
}


def read_line_amount(section: str, patterns: list[str]) -> float | None:
    lines = section.split("\n")
    for i, line in enumerate(lines):
        for pat in patterns:
            if not re.search(pat, line):
                continue
            nums: list[float] = []
            for j in range(i, min(i + 3, len(lines))):
                for token in re.findall(r"-?\d[\d,]+", lines[j]):
                    n = parse_num(token)
                    if n is not None and not (2000 <= n <= 2100):
                        nums.append(n)
            if nums:
                return nums[-1]
    return None


def parse_pdf_file(pdf_path: Path, folder_year: int) -> dict[str, Any]:
    text = extract_text(pdf_path)
    company_name = extract_company_name(text, pdf_path.name)
    fiscal_year = extract_fiscal_year(text, folder_year)

    income = pick_section(text, "income")
    balance = pick_section(text, "balance")

    income_unit = detect_unit(income) or detect_unit(text[:5000])
    balance_unit = detect_unit(balance) or income_unit

    raw: dict[str, float | None] = {}
    for key, pats in LINE_PATTERNS.items():
        sec = income if key in {"revenue", "cogs", "gross_profit", "sga", "operating_profit", "net_income"} else balance
        raw[key] = read_line_amount(sec, pats)

    rev_raw = raw.get("revenue")
    if rev_raw is not None:
        income_unit = guardrail_unit(rev_raw, income_unit)

    financials: dict[str, float] = {k: 0.0 for k in REQUIRED_KEYS}
    unit_map = {
        "revenue": income_unit,
        "cogs": income_unit,
        "gross_profit": income_unit,
        "sga": income_unit,
        "operating_profit": income_unit,
        "net_income": income_unit,
        "total_assets": balance_unit,
        "total_liabilities": balance_unit,
        "total_equity": balance_unit,
    }

    for key in [
        "revenue",
        "cogs",
        "gross_profit",
        "sga",
        "operating_profit",
        "net_income",
        "total_assets",
        "total_liabilities",
        "total_equity",
    ]:
        val = raw.get(key)
        if val is not None:
            u = unit_map.get(key, income_unit) or guardrail_unit(val, "")
            financials[key] = raw_to_million(val, u)

    debt_parts = []
    for dk in ("short_term_debt", "long_term_debt", "current_portion_debt"):
        v = raw.get(dk)
        if v is not None:
            u = balance_unit or guardrail_unit(v, "")
            debt_parts.append(raw_to_million(v, u))
    financials["total_debt"] = round2(sum(debt_parts)) if debt_parts else 0.0

    if financials["gross_profit"] == 0 and financials["revenue"] and financials["cogs"]:
        financials["gross_profit"] = round2(financials["revenue"] - financials["cogs"])

    revenue = financials["revenue"]
    ratios = {
        "cogs_ratio": round2(financials["cogs"] / revenue * 100) if revenue else 0.0,
        "operating_margin": round2(financials["operating_profit"] / revenue * 100) if revenue else 0.0,
        "debt_ratio": round2(financials["total_liabilities"] / financials["total_equity"] * 100)
        if financials["total_equity"]
        else 0.0,
    }

    return {
        "company_name": company_name,
        "year": fiscal_year,
        "source_file": pdf_path.name,
        "financials": {"unit": "백만원", **financials},
        "ratios": ratios,
        "parse_status": "ok" if revenue > 0 else "missing_revenue",
    }


def scan_directory(dir_path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    folder_year = int(dir_path.parent.name) if dir_path.parent.name.isdigit() else datetime.now().year
    pdfs = sorted(dir_path.glob("*.pdf"))
    records: list[dict[str, Any]] = []
    errors: list[str] = []

    for pdf in pdfs:
        try:
            records.append(parse_pdf_file(pdf, folder_year))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{pdf.name}: {exc}")

    parsed_files = {r["source_file"] for r in records}
    missing = [p.name for p in pdfs if p.name not in parsed_files]
    return records, missing + errors


def merge_master(records: list[dict[str, Any]], sector: str = "unknown") -> dict[str, Any]:
    companies: dict[str, Any] = {}
    for rec in records:
        key = f"{sector}:{normalize_company_key(rec['company_name'])}"
        entity = companies.setdefault(
            key,
            {
                "companyKey": normalize_company_key(rec["company_name"]),
                "companyName": rec["company_name"],
                "sector": sector,
                "history": {},
            },
        )
        entity["history"][str(rec["year"])] = {
            **rec["financials"],
            **rec["ratios"],
            "source_file": rec["source_file"],
            "has_data": rec["financials"]["revenue"] > 0,
        }
    return {
        "version": 6,
        "updatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "companies": companies,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="경쟁사 PDF 파서 (백만원 정규화)")
    parser.add_argument("--dir", type=Path, required=True, help="PDF 폴더")
    parser.add_argument("--out", type=Path, help="파일별 JSON 출력")
    parser.add_argument("--master-out", type=Path, help="master JSON 출력")
    parser.add_argument("--sector", default="unknown")
    args = parser.parse_args()

    if not args.dir.exists():
        raise SystemExit(f"폴더 없음: {args.dir}")

    records, problems = scan_directory(args.dir)
    pdf_count = len(list(args.dir.glob("*.pdf")))

    print(f"[parse_competitor_pdf] PDF {pdf_count}개 · 추출 {len(records)}개")
    if problems:
        print("[parse_competitor_pdf] 누락/오류:")
        for item in problems:
            print(f"  - {item}")

    zero_revenue = [r["source_file"] for r in records if r["financials"]["revenue"] <= 0]
    if zero_revenue:
        print("[parse_competitor_pdf] 매출 미추출:")
        for name in zero_revenue:
            print(f"  - {name}")

    payload = {"records": records, "pdfCount": pdf_count, "parsedAt": datetime.now(UTC).isoformat()}
    if args.out:
        args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote → {args.out}")

    if args.master_out:
        master = merge_master(records, args.sector)
        args.master_out.write_text(json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote master → {args.master_out}")


if __name__ == "__main__":
    main()
