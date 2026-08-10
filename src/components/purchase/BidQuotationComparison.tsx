import { Button } from '@/components/ui/Button';

import { type BidReviewerSummary } from '@/utils/bidQuotationReview';

import {

  computeBidAwardVerdict,

  formatBudgetDelta,

  formatWon,

  type BidQuotationCompareItem,

} from '@/utils/bidQuotationAnalysis';



interface BidQuotationComparisonProps {

  items: BidQuotationCompareItem[];

  executionBudget: number;

  reviewerSummary: BidReviewerSummary;

  comparisonBlob: Blob | null;

  comparisonFileName: string;

  markCount: number;

  downloadingExcel: boolean;

  onDownloadAnalysis: () => void;

}



export function BidQuotationComparison({

  items,

  executionBudget,

  reviewerSummary,

  comparisonBlob,

  comparisonFileName,

  markCount,

  downloadingExcel,

  onDownloadAnalysis,

}: BidQuotationComparisonProps) {

  const ranked = items.filter((item) => item.rank > 0);

  const failed = items.filter((item) => item.rank === 0);

  const awardVerdict = computeBidAwardVerdict(executionBudget, items);



  if (items.length === 0) return null;



  return (

    <section className="bid-quotation-compare" aria-label="분석결과">

      <h4 className="bid-quotation-compare__title">분석결과</h4>

      <p className="bid-quotation-compare__subtitle">

        상세내역 합산 + 관리비및경비 = 입찰금액 · 낮은 순(1위=최저가)

      </p>



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

                <span className="bid-quotation-compare__lines">
                  {item.message ?? `${item.lineCount}개 항목 합산`}
                </span>

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



      {awardVerdict && (

        <div

          className={`bid-quotation-compare__verdict${

            awardVerdict.outcome === 'awarded'

              ? ' bid-quotation-compare__verdict--awarded'

              : awardVerdict.outcome === 'failed'

                ? ' bid-quotation-compare__verdict--failed'

                : ''

          }`}

        >

          <span className="bid-quotation-compare__verdict-label">{awardVerdict.outcomeLabel}</span>

          <p className="bid-quotation-compare__verdict-text">

            {awardVerdict.outcome === 'awarded' &&

              `1위(${awardVerdict.firstRankVendorName}) 견적이 실행예산 이내입니다.`}

            {awardVerdict.outcome === 'failed' &&

              `1위(${awardVerdict.firstRankVendorName}) 견적이 실행예산을 초과합니다.`}

            {awardVerdict.outcome === 'unknown' &&

              '실행예산 또는 1위 견적 금액이 없어 낙찰·유찰을 판정할 수 없습니다.'}

          </p>

          <dl className="bid-quotation-compare__verdict-stats">

            <div className="bid-quotation-compare__verdict-stat">

              <dt>실행예산</dt>

              <dd>

                {awardVerdict.executionBudget > 0

                  ? formatWon(awardVerdict.executionBudget)

                  : '-'}

              </dd>

            </div>

            <div className="bid-quotation-compare__verdict-stat">

              <dt>1위 금액</dt>

              <dd>

                {awardVerdict.firstRankAmount != null

                  ? formatWon(awardVerdict.firstRankAmount)

                  : '-'}

              </dd>

            </div>

            <div className="bid-quotation-compare__verdict-stat">

              <dt>예산증감</dt>

              <dd

                className={

                  awardVerdict.budgetOverrunRatio != null && awardVerdict.budgetOverrunRatio > 0

                    ? 'bid-quotation-compare__verdict-stat-value--over'

                    : undefined

                }

              >

                {formatBudgetDelta(

                  awardVerdict.budgetOverrunRatio,

                  awardVerdict.firstRankAmount,

                  awardVerdict.executionBudget,

                )}

              </dd>

            </div>

          </dl>

        </div>

      )}



      {ranked.length >= 2 && (

        <div className="bid-quotation-review">

          <h5 className="bid-quotation-review__title">검토자 확인사항</h5>

          <p className="bid-quotation-review__overview">{reviewerSummary.overview}</p>



          {reviewerSummary.groups.length > 0 ? (

            <ul className="bid-reviewer-summary__list">

              {reviewerSummary.groups.map((group) => (

                <li

                  key={group.id}

                  className={`bid-reviewer-summary__item bid-reviewer-summary__item--${group.priority}`}

                >

                  <div className="bid-reviewer-summary__head">

                    <span className="bid-reviewer-summary__badge">

                      {group.priority === 'high' ? '긴급' : '확인'}

                    </span>

                    <strong className="bid-reviewer-summary__title">{group.title}</strong>

                    <span className="bid-reviewer-summary__count">{group.count}건</span>

                  </div>

                  <p className="bid-reviewer-summary__situation">{group.description}</p>



                  {group.count > 0 && (
                    <div className="bid-reviewer-summary__criteria">
                      <span className="bid-reviewer-summary__criteria-label">발생 기준</span>
                      <ul>
                        {group.criteria.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                    </div>
                  )}



                  {group.vendors.length > 0 ? (

                    <ul className="bid-reviewer-summary__vendors">

                      {group.vendors.map((vendor) => (

                        <li key={vendor.partnerId} className="bid-reviewer-summary__vendor">

                          <strong className="bid-reviewer-summary__vendor-name">

                            {vendor.vendorName}

                          </strong>

                          <ul className="bid-reviewer-summary__vendor-items">

                            {vendor.items.map((item) => (

                              <li key={item}>{item}</li>

                            ))}

                          </ul>

                          {vendor.rankChangeNote && (

                            <p className="bid-reviewer-summary__rank-note">

                              {vendor.rankChangeNote}

                            </p>

                          )}

                        </li>

                      ))}

                    </ul>

                  ) : (

                    group.emptyMessage && (

                      <p className="bid-reviewer-summary__empty">{group.emptyMessage}</p>

                    )

                  )}



                  {group.count > 0 && (

                    <div className="bid-reviewer-summary__actions">

                      <span className="bid-reviewer-summary__actions-label">추가 검토</span>

                      <ul>

                        {group.actions.map((action) => (

                          <li key={action}>{action}</li>

                        ))}

                      </ul>

                    </div>

                  )}

                </li>

              ))}

            </ul>

          ) : (

            <p className="bid-quotation-review__empty">{reviewerSummary.overview}</p>

          )}

        </div>

      )}



      {comparisonBlob && (

        <div className="bid-quotation-compare__download">

          <h5 className="bid-quotation-compare__download-title">분석파일</h5>

          <p className="bid-quotation-compare__download-desc">

            통합 비교 Excel · <strong>내역서</strong> 시트 이슈 셀 색상·테두리·메모 +

            <strong> 검토이슈</strong> 시트 상세 목록

            {markCount > 0 ? ` (${markCount}개 셀 마킹)` : ''}. Excel에서 [검토] → [메모

            표시]로 셀 메모를 확인하세요.

          </p>

          <Button

            variant="primary"

            onClick={onDownloadAnalysis}

            loading={downloadingExcel}

            disabled={downloadingExcel}

          >

            {comparisonFileName || '견적비교분석.xlsx'} 다운로드

          </Button>

        </div>

      )}

    </section>

  );

}


