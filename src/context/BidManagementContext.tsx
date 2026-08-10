import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { EMPTY_BID_SEARCH_FILTERS, type BidSearchFilters } from '@/types/bid';
import {
  EMPTY_BID_REGISTRATION_FORM,
  clearOutsourcingBidFields,
  type BidPartnerEntry,
  type BidRegistrationForm,
} from '@/types/bidRegistration';
import {
  clearBidDraftAll,
  loadBidDraft,
  saveBidDraft,
} from '@/utils/bidRegistrationStorage';

interface BidManagementContextValue {
  registrationForm: BidRegistrationForm;
  selectedProjectId: string;
  attachmentPanelOpen: boolean;
  quotationAttachments: BidPartnerEntry[];
  searchFilters: BidSearchFilters;
  draftReady: boolean;
  setRegistrationForm: (
    next: BidRegistrationForm | ((prev: BidRegistrationForm) => BidRegistrationForm),
  ) => void;
  setSelectedProjectId: (projectId: string) => void;
  setAttachmentPanelOpen: (open: boolean) => void;
  setQuotationAttachments: (
    next: BidPartnerEntry[] | ((prev: BidPartnerEntry[]) => BidPartnerEntry[]),
  ) => void;
  setSearchFilters: (filters: BidSearchFilters) => void;
  /** 폼·업체·견적서 첨부 전체 초기화 (입력 초기화 / 로그아웃) */
  resetRegistrationForm: () => void;
  /** 외주발주 입찰정보·참여업체·견적첨부만 초기화 (프로젝트 기본정보 유지) */
  resetBidInfo: () => void;
  /** @deprecated resetRegistrationForm 과 동일 */
  resetRegistration: () => void;
  resetSearchFilters: () => void;
}

const BidManagementContext = createContext<BidManagementContextValue | null>(null);

export function BidManagementProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const personId = session?.personId ?? null;
  const lastPersonIdRef = useRef<string | null>(null);

  const [registrationForm, setRegistrationFormState] = useState<BidRegistrationForm>({
    ...EMPTY_BID_REGISTRATION_FORM,
  });
  const [selectedProjectId, setSelectedProjectIdState] = useState('');
  const [attachmentPanelOpen, setAttachmentPanelOpenState] = useState(false);
  const [quotationAttachments, setQuotationAttachmentsState] = useState<BidPartnerEntry[]>([]);
  const [searchFilters, setSearchFiltersState] = useState<BidSearchFilters>(EMPTY_BID_SEARCH_FILTERS);
  const [draftReady, setDraftReady] = useState(false);

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

  const resetRegistrationForm = useCallback(() => {
    startTransition(() => {
      setRegistrationFormState({ ...EMPTY_BID_REGISTRATION_FORM });
      setSelectedProjectIdState('');
      setAttachmentPanelOpenState(false);
      setQuotationAttachmentsState([]);
    });

    if (personId) {
      void clearBidDraftAll(personId);
    }
  }, [personId]);

  const resetBidInfo = useCallback(() => {
    startTransition(() => {
      setRegistrationFormState((prev) => clearOutsourcingBidFields(prev));
      setAttachmentPanelOpenState(false);
      setQuotationAttachmentsState([]);
    });
  }, []);

  const resetRegistration = useCallback(() => {
    resetRegistrationForm();
  }, [resetRegistrationForm]);

  const resetSearchFilters = useCallback(() => {
    startTransition(() => {
      setSearchFiltersState(EMPTY_BID_SEARCH_FILTERS);
    });
  }, []);

  useEffect(() => {
    if (!personId) {
      setDraftReady(true);
      return;
    }

    let cancelled = false;
    setDraftReady(false);

    loadBidDraft(personId).then((draft) => {
      if (cancelled) return;

      if (draft) {
        setRegistrationFormState(draft.registrationForm);
        setSelectedProjectIdState(draft.selectedProjectId);
        setAttachmentPanelOpenState(draft.attachmentPanelOpen);
        setQuotationAttachmentsState(draft.quotationAttachments);
      }

      setDraftReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [personId]);

  useEffect(() => {
    if (!draftReady || !personId) return;

    void saveBidDraft(personId, {
      registrationForm,
      selectedProjectId,
      attachmentPanelOpen,
      quotationAttachments,
    });
  }, [
    draftReady,
    personId,
    registrationForm,
    selectedProjectId,
    attachmentPanelOpen,
    quotationAttachments,
  ]);

  useEffect(() => {
    if (session?.personId) {
      lastPersonIdRef.current = session.personId;
      return;
    }

    const previousPersonId = lastPersonIdRef.current;
    if (!previousPersonId) return;

    lastPersonIdRef.current = null;
    startTransition(() => {
      setRegistrationFormState({ ...EMPTY_BID_REGISTRATION_FORM });
      setSelectedProjectIdState('');
      setAttachmentPanelOpenState(false);
      setQuotationAttachmentsState([]);
    });
    void clearBidDraftAll(previousPersonId);
  }, [session]);

  const value: BidManagementContextValue = {
    registrationForm,
    selectedProjectId,
    attachmentPanelOpen,
    quotationAttachments,
    searchFilters,
    draftReady,
    setRegistrationForm,
    setSelectedProjectId,
    setAttachmentPanelOpen,
    setQuotationAttachments,
    setSearchFilters,
    resetRegistrationForm,
    resetBidInfo,
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
