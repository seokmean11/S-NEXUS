import { useMemo } from 'react';
import { KoreanDateInput } from '@/components/admin/KoreanDateInput';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { formatCurrency } from '@/data/mockData';
import type { Bid, BidSearchFilters, BidStatus } from '@/types/bid';
import { EMPTY_BID_SEARCH_FILTERS } from '@/types/bid';
import {
  getBidDivisionOptions,
  getBidTradeTypeOptions,
  summarizeBidSearch,
} from '@/utils/bidSearchFilter';
import { formatAmountInput, formatIsoToKoreanDate } from '@/utils/formatInput';
import type { ExportTable } from '@/utils/reportExport';
import { downloadCsv } from '@/utils/reportExport';

const STATUS_CLASS: Record<BidStatus, string> = {
  준비: 'badge--gray',
  진행: 'badge--blue',
  평가: 'badge--green',
  낙찰: 'badge--purple',
  유찰: 'badge--gray',
  취소: 'badge--gray',
};


interface BidSearchDashboardProps {
  allBids: Bid[];
  filteredBids: Bid[];
  filters: BidSearchFilters;
  onFiltersChange: (filters: BidSearchFilters) => void;
}

export function BidSearchDashboard({
  allBids,
  filteredBids,
  filters,
  onFiltersChange,
}: BidSearchDashboardProps) {
  const divisionOptions = useMemo(() => getBidDivisionOptions(allBids), [allBids]);
  const tradeTypeOptions = useMemo(() => getBidTradeTypeOptions(allBids), [allBids]);

  const setFilter = <K extends keyof BidSearchFilters>(key: K, value: BidSearchFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onFiltersChange(EMPTY_BID_SEARCH_FILTERS);
  };

  const handleExport = () => {
    const table: ExportTable = {
      headers: [
        '구분',
        '입찰명',
        '프로젝트명',
        '프로젝트코드',
        '공종',
        '발주처',
        '사업본부',
        '입찰방식',
        '추정금액',
        '입찰시작',
        '입찰마감',
        '상태',
      ],
      rows: filteredBids.map((bid) => [
        bid.bidCategory,
        bid.title,
        bid.projectName ?? '',
        bid.projectCode ?? '',
        bid.tradeType,
        bid.clientName,
        bid.divisionName,
        bid.bidMethod,
        bid.estimatedAmount ? String(bid.estimatedAmount) : '',
        formatIsoToKoreanDate(bid.bidStartDate),
        formatIsoToKoreanDate(bid.bidDeadline),
        bid.status,
      ]),
    };
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`입찰검색_${today}.csv`, table);
  };

  return (
    <Card
      title="입찰검색"
      subtitle="조건을 입력·선택하면 하단 결과가 실시간으로 교차 필터링됩니다"
      headerAction={
        <div className="bid-search__header-actions">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            초기화
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredBids.length === 0}>
            엑셀 다운로드
          </Button>
        </div>
      }
    >
      <div className="bid-search__filters no-print">
        <Input
          label="키워드 (프로젝트·입찰명)"
          value={filters.keyword}
          onChange={(e) => setFilter('keyword', e.target.value)}
          placeholder="예: 박물관, 리모델링"
        />
        <Input
          label="프로젝트 코드"
          value={filters.projectCode}
          onChange={(e) => setFilter('projectCode', e.target.value)}
          placeholder="예: 2025-4001-21"
        />
        <Select
          label="사업본부"
          value={filters.divisionName}
          onChange={(e) => setFilter('divisionName', e.target.value)}
          options={[{ value: '', label: '전체' }, ...divisionOptions]}
        />
        <Select
          label="공종"
          value={filters.tradeType}
          onChange={(e) => setFilter('tradeType', e.target.value)}
          options={[{ value: '', label: '전체' }, ...tradeTypeOptions]}
        />

        <div className="bid-search__range-field">
          <span className="form-field__label">입찰기간</span>
          <div className="bid-search__range-inputs">
            <KoreanDateInput
              value={filters.bidPeriodFrom}
              onChange={(value) => setFilter('bidPeriodFrom', value)}
            />
            <span className="bid-search__range-sep" aria-hidden>
              ~
            </span>
            <KoreanDateInput
              value={filters.bidPeriodTo}
              onChange={(value) => setFilter('bidPeriodTo', value)}
            />
          </div>
        </div>

        <div className="bid-search__range-field">
          <span className="form-field__label">금액범위</span>
          <div className="bid-search__range-inputs">
            <div className="form-field bid-search__amount-input">
              <input
                className="form-field__input"
                type="text"
                inputMode="numeric"
                value={filters.amountMin}
                onChange={(e) => setFilter('amountMin', formatAmountInput(e.target.value))}
                placeholder="최소 금액"
                aria-label="금액범위 최소"
              />
            </div>
            <span className="bid-search__range-sep" aria-hidden>
              ~
            </span>
            <div className="form-field bid-search__amount-input">
              <input
                className="form-field__input"
                type="text"
                inputMode="numeric"
                value={filters.amountMax}
                onChange={(e) => setFilter('amountMax', formatAmountInput(e.target.value))}
                placeholder="최대 금액"
                aria-label="금액범위 최대"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bid-search__summary" aria-live="polite">
        {summarizeBidSearch(allBids, filteredBids)}
      </div>

      <div className="bid-search__results bid-table-wrap">
        <table className="bid-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>입찰명</th>
              <th>코드</th>
              <th>공종</th>
              <th>사업본부</th>
              <th>추정금액</th>
              <th>입찰기간</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredBids.length === 0 ? (
              <tr>
                <td colSpan={8} className="bid-table__empty">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filteredBids.map((bid) => (
                <tr key={bid.id}>
                  <td>
                    <span
                      className={`badge ${bid.bidCategory === '신규' ? 'badge--blue' : 'badge--gray'}`}
                    >
                      {bid.bidCategory}
                    </span>
                  </td>
                  <td>
                    <strong>{bid.title}</strong>
                    {bid.projectName && (
                      <span className="bid-table__sub">{bid.projectName}</span>
                    )}
                  </td>
                  <td>{bid.projectCode ?? '-'}</td>
                  <td>{bid.tradeType}</td>
                  <td>{bid.divisionName}</td>
                  <td>{bid.estimatedAmount ? formatCurrency(bid.estimatedAmount) : '-'}</td>
                  <td>
                    {formatIsoToKoreanDate(bid.bidStartDate)} ~{' '}
                    {formatIsoToKoreanDate(bid.bidDeadline)}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[bid.status]}`}>{bid.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
