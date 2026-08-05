import { useMemo } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BidAnalysisChatbot } from '@/components/purchase/BidAnalysisChatbot';
import { BidNewRegistrationForm } from '@/components/purchase/BidNewRegistrationForm';
import { BidSearchDashboard } from '@/components/purchase/BidSearchDashboard';
import { useBidManagement } from '@/context/BidManagementContext';
import { MOCK_BIDS } from '@/data/mockBidData';
import { filterBids } from '@/utils/bidSearchFilter';

export function BidManagementPage() {
  const { searchFilters, setSearchFilters } = useBidManagement();

  const filteredBids = useMemo(
    () => filterBids(MOCK_BIDS, searchFilters),
    [searchFilters],
  );

  return (
    <ErrorBoundary fallbackTitle="입찰관리 화면 오류">
      <div className="bid-management-page">
        <BidNewRegistrationForm />
        <BidSearchDashboard
          allBids={MOCK_BIDS}
          filteredBids={filteredBids}
          filters={searchFilters}
          onFiltersChange={setSearchFilters}
        />
        <BidAnalysisChatbot bids={filteredBids} />
      </div>
    </ErrorBoundary>
  );
}
