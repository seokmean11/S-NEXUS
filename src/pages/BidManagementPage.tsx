import { useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BidAnalysisChatbot } from '@/components/purchase/BidAnalysisChatbot';
import { BidNewRegistrationForm } from '@/components/purchase/BidNewRegistrationForm';
import { BidSearchDashboard } from '@/components/purchase/BidSearchDashboard';
import { MOCK_BIDS } from '@/data/mockBidData';
import { EMPTY_BID_SEARCH_FILTERS } from '@/types/bid';
import { filterBids } from '@/utils/bidSearchFilter';

export function BidManagementPage() {
  const [filters, setFilters] = useState(EMPTY_BID_SEARCH_FILTERS);

  const filteredBids = useMemo(
    () => filterBids(MOCK_BIDS, filters),
    [filters],
  );

  return (
    <ErrorBoundary fallbackTitle="입찰관리 화면 오류">
      <div className="bid-management-page">
        <BidNewRegistrationForm />
        <BidSearchDashboard
          allBids={MOCK_BIDS}
          filteredBids={filteredBids}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <BidAnalysisChatbot bids={filteredBids} />
      </div>
    </ErrorBoundary>
  );
}
