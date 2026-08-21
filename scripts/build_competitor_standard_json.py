#!/usr/bin/env python3
"""
경쟁사분석 competitor-data.json → 공통 표준 스키마 JSON 통합 생성.

사용 예:
  python scripts/build_competitor_standard_json.py
  python scripts/build_competitor_standard_json.py --root .data/nexus-drive/경쟁사분석
  python scripts/build_competitor_standard_json.py --output standard-competitor-data.json
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def round2(value: float) -> float:
    return round(value, 2)


def safe_ratio(n: float | None, d: float | None) -> float | None:
    if n is None or d is None or d == 0:
        return None
    return round2(n / d * 100)


def to_million_from_won(won: float | None) -> float | None:
    if won is None:
        return None
    return round2(won / 1_000_000)


def get_metric(metrics: list[dict[str, Any]], key: str) -> float | str | None:
    for metric in metrics:
        if metric.get("key") == key:
            return metric.get("value")
    return None


def get_metric_number(metrics: list[dict[str, Any]], key: str) -> float | None:
    value = get_metric(metrics, key)
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.-]", "", str(value).replace(",", ""))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def infer_amount_unit_from_revenue(revenue: float) -> str:
    abs_val = abs(revenue)
    if abs_val >= 100_000_000:
        return "원"
    if abs_val >= 100_000:
        return "천원"
    if abs_val <= 10_000:
        return "백만원"
    return "천원"


def metric_unit_hint(unit: str | None) -> str | None:
    if not unit:
        return None
    compact = re.sub(r"\s+", "", unit)
    if "백만" in compact:
        return "백만원"
    if "천" in compact:
        return "천원"
    if compact == "원":
        return "원"
    return None


def metrics_appear_normalized_to_won(metrics: list[dict[str, Any]]) -> bool:
    revenue = get_metric_number(metrics, "revenue")
    if revenue is None:
        return False
    revenue_metric = next((m for m in metrics if m.get("key") == "revenue"), None)
    if revenue_metric and revenue_metric.get("amountUnit"):
        return False
    if revenue_metric and revenue_metric.get("unit") != "원":
        return False
    return abs(revenue) >= 1_000_000_000


def infer_amount_unit(metrics: list[dict[str, Any]]) -> str:
    for metric in metrics:
        amount_unit = metric.get("amountUnit")
        if amount_unit in {"원", "천원", "백만원"}:
            return amount_unit
    for metric in metrics:
        if metric.get("key") == "revenue":
            hinted = metric_unit_hint(metric.get("unit"))
            if hinted and hinted != "원":
                return hinted
    revenue = get_metric_number(metrics, "revenue")
    if revenue is not None:
        return infer_amount_unit_from_revenue(revenue)
    return "백만원"


def raw_amount_to_won(value: float, unit: str) -> float:
    if unit == "천원":
        return round(value * 1_000)
    if unit == "백만원":
        return round(value * 1_000_000)
    return round(value)


def to_won(value: float | None, unit: str) -> float | None:
    if value is None:
        return None
    return raw_amount_to_won(value, unit)


def read_amount_metric(metrics: list[dict[str, Any]], key: str, default_unit: str) -> float | None:
    if metrics_appear_normalized_to_won(metrics):
        return get_metric_number(metrics, key)

    metric = next((m for m in metrics if m.get("key") == key), None)
    raw = get_metric_number(metrics, key)
    if raw is None:
        return None

    unit = metric.get("amountUnit") if metric else None
    if not unit:
        unit = metric_unit_hint(metric.get("unit") if metric else None) or default_unit
    return to_won(raw, unit)


def infer_amount_scale(metrics: list[dict[str, Any]]) -> str:
    if metrics_appear_normalized_to_won(metrics):
        return "원"
    unit = infer_amount_unit(metrics)
    return "백만원" if unit == "백만원" else "원"


@dataclass
class StandardMetadata:
    ceo_name: str | None
    foundation_year: int | None
    employees: int | None
    employees_change: int | None
    credit_rating: str | None
    source_type: str | None
    source_file: str | None


@dataclass
class StandardAmounts:
    unit: str
    revenue: float | None
    cogs: float | None
    gross_profit: float | None
    sga: float | None
    operating_profit: float | None
    net_income: float | None
    total_assets: float | None
    current_assets: float | None
    cash_assets: float | None
    total_liabilities: float | None
    current_liabilities: float | None
    short_term_debt: float | None
    long_term_debt: float | None
    total_equity: float | None
    total_debt: float | None
    receivables: float | None


@dataclass
class StandardRatios:
    cogs_ratio: float | None
    sga_ratio: float | None
    operating_margin: float | None
    debt_ratio: float | None
    receivables_turnover: float | None


@dataclass
class StandardRecord:
    company_name: str
    biz_no: str | None
    year: int
    metadata: StandardMetadata
    financials: StandardAmounts
    ratios: StandardRatios
    has_data: bool
    source_file: str | None = None
    source_type: str | None = None
    document_type: str | None = None
    sector: str | None = None


def document_type_to_source_type(document_type: str | None, source_file: str | None = None) -> str | None:
    if document_type == "credit-rating" and source_file:
        if "신용분석" in source_file:
            return "신용분석보고서"
        if "신용평가" in source_file:
            return "신용평가서"
    mapping = {
        "audit-report": "감사보고서",
        "business-report": "사업보고서",
        "credit-rating": "신용분석보고서",
        "financial-sheet": "재무자료",
    }
    if not document_type:
        return None
    return mapping.get(document_type, "미분류")


def document_type_priority(document_type: str | None, source_file: str | None = None) -> int:
    """신용평가서 > 신용분석(SCI 등) > 감사보고서 > 사업보고서 > 재무자료"""
    name = source_file or ""
    if "신용평가서" in name:
        return 100
    if document_type == "credit-rating":
        if any(token in name for token in ("SCI", "평가정보", "신용분석", "민간", "기업신용평가")):
            return 90
        if "신용평가" in name:
            return 100
        return 90
    mapping = {
        "audit-report": 70,
        "business-report": 60,
        "financial-sheet": 40,
    }
    return mapping.get(document_type or "", 0)


def should_replace_document(existing: dict[str, Any], incoming: dict[str, Any]) -> bool:
    existing_priority = document_type_priority(
        existing.get("document_type"),
        existing.get("source_file") or (existing.get("source_files") or [None])[0],
    )
    incoming_priority = document_type_priority(
        incoming.get("document_type"),
        incoming.get("source_file") or (incoming.get("source_files") or [None])[0],
    )
    if incoming_priority > existing_priority:
        return True
    if incoming_priority < existing_priority:
        return False
    return (incoming.get("parsed_at") or "") >= (existing.get("parsed_at") or "")


def build_standard_amounts(metrics: list[dict[str, Any]]) -> StandardAmounts:
    default_unit = infer_amount_unit(metrics)

    revenue = to_million_from_won(read_amount_metric(metrics, "revenue", default_unit))
    cogs = to_million_from_won(read_amount_metric(metrics, "costOfGoodsSold", default_unit))
    gross_profit_direct = to_million_from_won(read_amount_metric(metrics, "grossProfit", default_unit))
    gross_profit = gross_profit_direct if gross_profit_direct is not None else (
        round2(revenue - cogs) if revenue is not None and cogs is not None else None
    )
    sga = to_million_from_won(read_amount_metric(metrics, "sga", default_unit))
    operating_profit = to_million_from_won(read_amount_metric(metrics, "operatingIncome", default_unit))
    net_income = to_million_from_won(read_amount_metric(metrics, "netIncome", default_unit))
    total_assets = to_million_from_won(read_amount_metric(metrics, "totalAssets", default_unit))
    current_assets = to_million_from_won(read_amount_metric(metrics, "currentAssets", default_unit))
    total_liabilities = to_million_from_won(read_amount_metric(metrics, "totalLiabilities", default_unit))
    current_liabilities = to_million_from_won(read_amount_metric(metrics, "currentLiabilities", default_unit))
    total_equity = to_million_from_won(read_amount_metric(metrics, "equity", default_unit))

    cash_assets = to_million_from_won(
        read_amount_metric(metrics, "cashAndEquivalentsMillion", default_unit)
        or read_amount_metric(metrics, "cashAndEquivalents", default_unit)
    )
    receivables = to_million_from_won(read_amount_metric(metrics, "accountsReceivable", default_unit))

    short_debt = to_million_from_won(
        read_amount_metric(metrics, "shortTermDebtMillion", default_unit)
        or read_amount_metric(metrics, "shortTermDebt", default_unit)
    )
    long_debt = to_million_from_won(
        read_amount_metric(metrics, "longTermDebtMillion", default_unit)
        or read_amount_metric(metrics, "longTermDebt", default_unit)
    )
    current_portion = to_million_from_won(
        read_amount_metric(metrics, "currentPortionLongTermDebtMillion", default_unit)
        or read_amount_metric(metrics, "currentPortionLongTermDebt", default_unit)
    )
    long_term_debt = round2((long_debt or 0) + (current_portion or 0)) if long_debt is not None or current_portion is not None else None
    total_debt = round2((short_debt or 0) + (long_term_debt or 0)) if short_debt is not None or long_term_debt is not None else None

    return StandardAmounts(
        unit="백만원",
        revenue=revenue,
        cogs=cogs,
        gross_profit=gross_profit,
        sga=sga,
        operating_profit=operating_profit,
        net_income=net_income,
        total_assets=total_assets,
        current_assets=current_assets,
        cash_assets=cash_assets,
        total_liabilities=total_liabilities,
        current_liabilities=current_liabilities,
        short_term_debt=short_debt,
        long_term_debt=long_term_debt,
        total_equity=total_equity,
        total_debt=total_debt,
        receivables=receivables,
    )


def build_standard_ratios(amounts: StandardAmounts) -> StandardRatios:
    revenue = amounts.revenue
    return StandardRatios(
        cogs_ratio=safe_ratio(amounts.cogs, revenue),
        sga_ratio=safe_ratio(amounts.sga, revenue),
        operating_margin=safe_ratio(amounts.operating_profit, revenue),
        debt_ratio=safe_ratio(amounts.total_liabilities, amounts.total_equity),
        receivables_turnover=(
            round2(revenue / amounts.receivables)
            if revenue is not None and amounts.receivables not in (None, 0)
            else None
        ),
    )


def build_standard_financials(metrics: list[dict[str, Any]]) -> StandardAmounts:
    return build_standard_amounts(metrics)


def build_record_from_company(company: dict[str, Any], folder_year: int, sector: str) -> StandardRecord:
    metrics = company.get("metrics") or []
    financials = build_standard_amounts(metrics)
    ratios = build_standard_ratios(financials)
    employees_raw = get_metric_number(metrics, "employees")
    employees_prior_raw = get_metric_number(metrics, "employeesPrior")
    employees = (
        int(round(employees_raw))
        if employees_raw is not None and 0 < employees_raw < 1_000_000
        else None
    )
    employees_prior = (
        int(round(employees_prior_raw))
        if employees_prior_raw is not None and 0 < employees_prior_raw < 1_000_000
        else None
    )
    employees_change = employees - employees_prior if employees is not None and employees_prior is not None else None
    biz_no = get_metric(metrics, "bizNo")
    if isinstance(biz_no, str):
        biz_no = biz_no.strip() or None
    else:
        biz_no = None

    has_data = financials.revenue is not None or financials.operating_profit is not None
    document_type = company.get("documentType")
    source_file = company.get("source_file") or (company.get("sourceFiles") or [None])[0]
    source_type = company.get("source_type") or document_type_to_source_type(document_type, source_file)
    meta = company.get("metadata") or {}

    metadata = StandardMetadata(
        ceo_name=meta.get("ceo_name"),
        foundation_year=meta.get("foundation_year"),
        employees=meta.get("employees") if meta.get("employees") is not None else employees,
        employees_change=meta.get("employees_change") if meta.get("employees_change") is not None else employees_change,
        credit_rating=meta.get("credit_rating") or get_metric(metrics, "creditRating"),
        source_type=meta.get("source_type") or source_type,
        source_file=meta.get("source_file") or source_file,
    )

    return StandardRecord(
        company_name=company.get("companyName") or company.get("companyKey") or "unknown",
        biz_no=biz_no,
        year=company.get("fiscalYear") or folder_year,
        metadata=metadata,
        financials=financials,
        ratios=ratios,
        has_data=has_data,
        source_file=source_file,
        source_type=source_type,
        document_type=document_type,
        sector=sector,
    )


def find_competitor_data_files(root: Path) -> list[Path]:
    return sorted(root.rglob("competitor-data.json"))


def build_standard_dataset(root: Path) -> dict[str, Any]:
    records_by_key: dict[str, dict[str, Any]] = {}

    for json_path in find_competitor_data_files(root):
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        folder_year = payload.get("year")
        sector = payload.get("sector")
        if not isinstance(folder_year, int) or not isinstance(sector, str):
            continue

        for company in payload.get("companies") or []:
            record = build_record_from_company(company, folder_year, sector)
            if not record.has_data:
                continue

            dedup_key = f"{sector}:{record.company_name}:{record.year}"
            candidate = asdict(record)
            candidate["parsed_at"] = company.get("parsedAt") or ""
            candidate["document_type"] = company.get("documentType")

            existing = records_by_key.get(dedup_key)
            if not existing or should_replace_document(existing, candidate):
                records_by_key[dedup_key] = candidate

    records = list(records_by_key.values())
    records.sort(key=lambda item: (item.get("sector") or "", -(item.get("financials") or {}).get("revenue") or 0))

    return {
        "version": 2,
        "schema": "competitor-standard-v2",
        "updatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "sourceRoot": str(root),
        "recordCount": len(records),
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="competitor-data.json → 공통 표준 스키마 통합 JSON")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(".data/nexus-drive/경쟁사분석"),
        help="경쟁사분석 Drive 캐시 루트",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="출력 JSON 경로 (기본: {root}/standard-competitor-data.json)",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.exists():
        raise SystemExit(f"경로를 찾을 수 없습니다: {root}")

    dataset = build_standard_dataset(root)
    output = args.output or (root / "standard-competitor-data.json")
    output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {dataset['recordCount']} records → {output}")


if __name__ == "__main__":
    main()
