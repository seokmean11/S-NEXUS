import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { EMPTY_BID_SEARCH_FILTERS, type BidSearchFilters } from '@/types/bid';
import {
  EMPTY_BID_REGISTRATION_FORM,
  type BidPartnerEntry,
  type BidRegistrationForm,
} from '@/types/bidRegistration';

interface BidManagementContextValue {
  registrationForm: BidRegistrationForm;
  selectedProjectId: string;
  attachmentPanelOpen: boolean;
  quotationAttachments: BidPartnerEntry[];
  searchFilters: BidSearchFilters;
  setRegistrationForm: (
    next: BidRegistrationForm | ((prev: BidRegistrationForm) => BidRegistrationForm),
  ) => void;
  setSelectedProjectId: (projectId: string) => void;
  setAttachmentPanelOpen: (open: boolean) => void;
  setQuotationAttachments: (
    next: BidPartnerEntry[] | ((prev: BidPartnerEntry[]) => BidPartnerEntry[]),
  ) => void;
  setSearchFilters: (filters: BidSearchFilters) => void;
  resetRegistration: () => void;
  resetSearchFilters: () => void;
}

const BidManagementContext = createContext<BidManagementContextValue | null>(null);

export function BidManagementProvider({ children }: { children: ReactNode }) {
  const [registrationForm, setRegistrationFormState] = useState<BidRegistrationForm>({
    ...EMPTY_BID_REGISTRATION_FORM,
  });
  const [selectedProjectId, setSelectedProjectIdState] = useState('');
  const [attachmentPanelOpen, setAttachmentPanelOpenState] = useState(false);
  const [quotationAttachments, setQuotationAttachmentsState] = useState<BidPartnerEntry[]>([]);
  const [searchFilters, setSearchFiltersState] = useState<BidSearchFilters>(EMPTY_BID_SEARCH_FILTERS);

  const setRegistrationForm = useCallback(
    (next: BidRegistrationForm | ((prev: BidRegistrationForm) => BidRegistrationForm)) => {
      startTransition(() => {
        setRegistrationFormState(next);
      });
    },
    [],
  );

  const setSelectedProjectId = useCallback((projectId: string) => {
    setSelectedProjectIdState(projectId);
  }, []);

  const setAttachmentPanelOpen = useCallback((open: boolean) => {
    setAttachmentPanelOpenState(open);
  }, []);

  const setQuotationAttachments = useCallback(
    (next: BidPartnerEntry[] | ((prev: BidPartnerEntry[]) => BidPartnerEntry[])) => {
      setQuotationAttachmentsState(next);
    },
    [],
  );

  const setSearchFilters = useCallback((filters: BidSearchFilters) => {
    startTransition(() => {
      setSearchFiltersState(filters);
    });
  }, []);

  const resetRegistration = useCallback(() => {
    startTransition(() => {
      setRegistrationFormState({ ...EMPTY_BID_REGISTRATION_FORM });
      setSelectedProjectIdState('');
      setAttachmentPanelOpenState(false);
      setQuotationAttachmentsState([]);
    });
  }, []);

  const resetSearchFilters = useCallback(() => {
    startTransition(() => {
      setSearchFiltersState(EMPTY_BID_SEARCH_FILTERS);
    });
  }, []);

  const value: BidManagementContextValue = {
    registrationForm,
    selectedProjectId,
    attachmentPanelOpen,
    quotationAttachments,
    searchFilters,
    setRegistrationForm,
    setSelectedProjectId,
    setAttachmentPanelOpen,
    setQuotationAttachments,
    setSearchFilters,
    resetRegistration,
    resetSearchFilters,
  };

  return <BidManagementContext.Provider value={value}>{children}</BidManagementContext.Provider>;
}

export function useBidManagement(): BidManagementContextValue {
  const context = useContext(BidManagementContext);
  if (!context) {
    throw new Error('useBidManagement must be used within BidManagementProvider');
  }
  return context;
}
