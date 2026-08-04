import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useVirtualList } from '@/hooks/useVirtualList';
import type { OutsourcingRecord } from '@/types/outsourcing';
import {
  buildOutsourcingDetailExportTable,
  formatOutsourcingDetailValue,
  OUTSOURCING_DETAIL_COLUMNS,
} from '@/utils/outsourcingDetailTable';
import { downloadCsv } from '@/utils/reportExport';

const ROW_HEIGHT = 34;
const COLUMN_COUNT = OUTSOURCING_DETAIL_COLUMNS.length;

interface OutsourcingDetailPanelProps {
  records: OutsourcingRecord[];
  isPending?: boolean;
}

export function OutsourcingDetailPanel({ records, isPending = false }: OutsourcingDetailPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateViewport = () => setViewportHeight(element.clientHeight);
    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, [records.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [records]);

  const { startIndex, endIndex, paddingTop, paddingBottom } = useVirtualList({
    itemCount: records.length,
    itemHeight: ROW_HEIGHT,
    scrollTop,
    viewportHeight,
  });

  const visibleRecords = useMemo(
    () => records.slice(startIndex, endIndex),
    [records, startIndex, endIndex],
  );

  const handleExport = () => {
    const table = buildOutsourcingDetailExportTable(records);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`외주검색결과_상세_${today}.csv`, table);
  };

  return (
    <Card
      title="검색결과(상세)"
      subtitle={`필터 적용 ${records.length.toLocaleString('ko-KR')}건 · 가로·세로 스크롤로 전체 열을 확인할 수 있습니다`}
      headerAction={
        <Button variant="outline" size="sm" onClick={handleExport} disabled={records.length === 0}>
          CSV_내보내기
        </Button>
      }
    >
      {records.length === 0 ? (
        <p className="outsourcing-detail__empty">표시할 검색 결과가 없습니다.</p>
      ) : (
        <>
          {isPending && <p className="outsourcing-detail__pending">표 목록을 갱신하는 중…</p>}
          <div
            ref={scrollRef}
            className="outsourcing-detail__scroll"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <table className="outsourcing-detail__table">
              <thead>
                <tr>
                  {OUTSOURCING_DETAIL_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={{ minWidth: column.minWidth ? `${column.minWidth}px` : undefined }}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr aria-hidden="true" className="outsourcing-detail__spacer">
                    <td colSpan={COLUMN_COUNT} style={{ height: paddingTop }} />
                  </tr>
                )}
                {visibleRecords.map((record, offset) => {
                  const rowIndex = startIndex + offset;
                  return (
                    <tr key={rowIndex}>
                      {OUTSOURCING_DETAIL_COLUMNS.map((column) => {
                        const displayValue = formatOutsourcingDetailValue(record, column);
                        return (
                          <td
                            key={column.key}
                            className={
                              column.kind === 'text'
                                ? 'outsourcing-detail__cell outsourcing-detail__cell--text'
                                : 'outsourcing-detail__cell outsourcing-detail__cell--number'
                            }
                            title={displayValue}
                          >
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true" className="outsourcing-detail__spacer">
                    <td colSpan={COLUMN_COUNT} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
