import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/data/mockData';
import type { Bid, BidStatus } from '@/types/bid';
import { formatIsoToKoreanDate } from '@/utils/formatInput';
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

interface BidDashboardProps {
  bids: Bid[];
}

export function BidDashboard({ bids }: BidDashboardProps) {
  const stats = useMemo(
    () => ({
      total: bids.length,
      active: bids.filter((b) => ['준비', '진행', '평가'].includes(b.status)).length,
      upcoming: bids.filter((b) => {
        const deadline = new Date(b.bidDeadline).getTime();
        const now = Date.now();
        const week = 7 * 24 * 60 * 60 * 1000;
        return deadline >= now && deadline <= now + week && b.status !== '낙찰';
      }).length,
      awarded: bids.filter((b) => b.status === '낙찰').length,
    }),
    [bids],
  );

  const handleExport = () => {
    const table: ExportTable = {
      headers: [
        '입찰명',
        '발주처',
        '사업본부',
        '팀',
        '입찰방식',
        '추정금액',
        '마감일',
        '상태',
        '비고',
      ],
      rows: bids.map((bid) => [
        bid.title,
        bid.clientName,
        bid.divisionName,
        bid.teamName ?? '',
        bid.bidMethod,
        bid.estimatedAmount ? String(bid.estimatedAmount) : '',
        formatIsoToKoreanDate(bid.bidDeadline),
        bid.status,
        bid.note ?? '',
      ]),
    };
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`입찰_목록_${today}.csv`, table);
  };

  return (
    <>
      <div className="stats-row">
        <Card className="stat-card">
          <span className="stat-card__label">전체 입찰</span>
          <strong className="stat-card__value">{stats.total}건</strong>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__label">진행·평가</span>
          <strong className="stat-card__value">{stats.active}건</strong>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__label">7일 내 마감</span>
          <strong className="stat-card__value">{stats.upcoming}건</strong>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__label">낙찰</span>
          <strong className="stat-card__value">{stats.awarded}건</strong>
        </Card>
      </div>

      <Card
        title="입찰 목록"
        subtitle={`총 ${bids.length}건`}
        headerAction={
          <Button variant="outline" size="sm" onClick={handleExport}>
            엑셀 다운로드
          </Button>
        }
      >
        <div className="bid-table-wrap">
          <table className="bid-table">
            <thead>
              <tr>
                <th>입찰명</th>
                <th>발주처</th>
                <th>사업본부</th>
                <th>입찰방식</th>
                <th>추정금액</th>
                <th>마감일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 ? (
                <tr>
                  <td colSpan={7} className="bid-table__empty">
                    등록된 입찰이 없습니다.
                  </td>
                </tr>
              ) : (
                bids.map((bid) => (
                  <tr key={bid.id}>
                    <td>
                      <strong>{bid.title}</strong>
                      {bid.projectName && (
                        <span className="bid-table__sub">{bid.projectName}</span>
                      )}
                    </td>
                    <td>{bid.clientName}</td>
                    <td>{bid.divisionName}</td>
                    <td>{bid.bidMethod}</td>
                    <td>{bid.estimatedAmount ? formatCurrency(bid.estimatedAmount) : '-'}</td>
                    <td>{formatIsoToKoreanDate(bid.bidDeadline)}</td>
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
    </>
  );
}
