import { Button } from '@/components/ui/Button';
import { formatWon, type BidQuotationCompareItem } from '@/utils/bidQuotationAnalysis';

interface BidQuotationComparisonProps {
  items: BidQuotationCompareItem[];
  executionBudget: number;
  comparisonBlob: Blob | null;
  comparisonFileName: string;
  onDownloadAnalysis: () => void;
}

export function BidQuotationComparison({
  items,
  executionBudget,
  comparisonBlob,
  comparisonFileName,
  onDownloadAnalysis,
}: BidQuotationComparisonProps) {
  const ranked = items.filter((item) => item.rank > 0);
  const failed = items.filter((item) => item.rank === 0);
  const topBid = ranked.find((item) => item.rank === 1);
  const topAmount = topBid?.totalAmount ?? null;

  const showVerdict = topAmount != null && executionBudget > 0;
  const isFailed = showVerdict && topAmount > executionBudget;

  if (items.length === 0) return null;

  return (
    <section className="bid-quotation-compare" aria-label="협력사 견적 비교">
      <h4 className="bid-quotation-compare__title">견적 총액 순위 비교</h4>
      <p className="bid-quotation-compare__subtitle">
        ERP 견적서 · 시트명 무관, 발주품의명·견적수량 상세내역 시트 자동 선택 · 통합내역 작성 후 순위 비교
      </p>

      {showVerdict && (
        <div
          className={`bid-quotation-compare__verdict${
            isFailed
              ? ' bid-quotation-compare__verdict--failed'
              : ' bid-quotation-compare__verdict--awarded'
          }`}
          role="alert"
        >
          {isFailed ? (
            <>
              <strong className="bid-quotation-compare__verdict-label">유찰</strong>
              <p className="bid-quotation-compare__verdict-text">
                1위 업체({topBid?.vendorName}) 견적금액{' '}
                <strong>{formatWon(topAmount)}</strong>이 실행예산{' '}
                <strong>{formatWon(executionBudget)}</strong>을 초과했습니다.
              </p>
            </>
          ) : (
            <>
              <strong className="bid-quotation-compare__verdict-label">낙찰</strong>
              <p className="bid-quotation-compare__verdict-text">
                1위 업체({topBid?.vendorName}) 견적금액{' '}
                <strong>{formatWon(topAmount)}</strong>이 실행예산{' '}
                <strong>{formatWon(executionBudget)}</strong> 이내입니다.
              </p>
            </>
          )}
        </div>
      )}

      {ranked.length > 0 ? (
        <div className="bid-quotation-compare__columns">
          {ranked.map((item) => (
            <article
              key={item.partnerId}
              className={`bid-quotation-compare__column${item.rank === 1 ? ' bid-quotation-compare__column--top' : ''}`}
            >
              <span className="bid-quotation-compare__rank">{item.rank}위</span>
              <strong className="bid-quotation-compare__vendor">{item.vendorName}</strong>
              <span className="bid-quotation-compare__amount">
                {formatWon(item.totalAmount ?? 0)}
              </span>
              {item.lineCount > 0 && (
                <span className="bid-quotation-compare__lines">{item.lineCount}개 항목 합산</span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="bid-quotation-compare__empty">분석 가능한 Excel 견적서가 없습니다.</p>
      )}

      {failed.length > 0 && (
        <ul className="bid-quotation-compare__errors">
          {failed.map((item) => (
            <li key={item.partnerId}>
              {item.vendorName}: {item.message ?? '분석 실패'}
            </li>
          ))}
        </ul>
      )}

      {comparisonBlob && (
        <div className="bid-quotation-compare__download">
          <h5 className="bid-quotation-compare__download-title">분석파일</h5>
          <p className="bid-quotation-compare__download-desc">
            순위별 견적단가~경비금액 컬럼을 우측으로 나열한 Excel 비교표입니다. 오프라인 검토용으로
            내려받을 수 있습니다.
          </p>
          <Button variant="primary" onClick={onDownloadAnalysis}>
            {comparisonFileName || '견적비교분석.xlsx'} 다운로드
          </Button>
        </div>
      )}
    </section>
  );
}
