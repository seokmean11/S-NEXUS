import type { BidPartnerEntry, BidRegistrationForm } from '@/types/bidRegistration';
import { EMPTY_BID_REGISTRATION_FORM } from '@/types/bidRegistration';

const DB_NAME = 's-nexus-bid-registration';
const DB_VERSION = 1;
const META_STORE = 'draft-meta';
const FILE_STORE = 'draft-files';

export interface StoredBidDraft {
  registrationForm: BidRegistrationForm;
  selectedProjectId: string;
  attachmentPanelOpen: boolean;
  attachments: Array<{
    id: string;
    vendorName: string;
    fileName: string;
    fileType: string;
    lastModified: number;
  }>;
}

export interface LoadedBidDraft {
  registrationForm: BidRegistrationForm;
  selectedProjectId: string;
  attachmentPanelOpen: boolean;
  quotationAttachments: BidPartnerEntry[];
}

function draftKey(personId: string): string {
  return personId;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'personId' });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDatabase().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = run(store);

        tx.oncomplete = () => {
          if (request && 'result' in request) {
            resolve((request as IDBRequest<T>).result);
          } else {
            resolve();
          }
        };
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }),
  );
}

async function saveAttachmentFiles(personId: string, attachments: BidPartnerEntry[]): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save attachment files'));

    for (const attachment of attachments) {
      store.put({
        id: attachment.id,
        personId,
        blob: attachment.file,
        fileName: attachment.file.name,
        fileType: attachment.file.type,
        lastModified: attachment.file.lastModified,
      });
    }
  });
}

async function deleteAttachmentFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    void openDatabase().then((db) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      const store = tx.objectStore(FILE_STORE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete attachment files'));
      for (const id of ids) {
        store.delete(id);
      }
    });
  });
}

async function deleteAllAttachmentFilesForPerson(personId: string): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const request = store.openCursor();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear attachment files'));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as { id: string; personId: string };
      if (value.personId === personId) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

async function loadAttachmentFile(id: string): Promise<File | null> {
  const record = await runTransaction<{
    blob: Blob;
    fileName: string;
    fileType: string;
    lastModified: number;
  }>(FILE_STORE, 'readonly', (store) => store.get(id));

  if (!record) return null;

  return new File([record.blob], record.fileName, {
    type: record.fileType,
    lastModified: record.lastModified,
  });
}

export async function loadBidDraft(personId: string): Promise<LoadedBidDraft | null> {
  try {
    const meta = await runTransaction<StoredBidDraft & { personId: string }>(
      META_STORE,
      'readonly',
      (store) => store.get(draftKey(personId)),
    );

    if (!meta) return null;

    const quotationAttachments: BidPartnerEntry[] = [];
    for (const attachment of meta.attachments ?? []) {
      const file = await loadAttachmentFile(attachment.id);
      if (!file) continue;
      quotationAttachments.push({
        id: attachment.id,
        vendorName: attachment.vendorName,
        file,
      });
    }

    return {
      registrationForm: { ...EMPTY_BID_REGISTRATION_FORM, ...meta.registrationForm },
      selectedProjectId: meta.selectedProjectId ?? '',
      attachmentPanelOpen: Boolean(meta.attachmentPanelOpen),
      quotationAttachments,
    };
  } catch {
    return null;
  }
}

export async function saveBidDraft(
  personId: string,
  data: {
    registrationForm: BidRegistrationForm;
    selectedProjectId: string;
    attachmentPanelOpen: boolean;
    quotationAttachments: BidPartnerEntry[];
  },
): Promise<void> {
  try {
    const attachments = data.quotationAttachments.map((attachment) => ({
      id: attachment.id,
      vendorName: attachment.vendorName,
      fileName: attachment.file.name,
      fileType: attachment.file.type,
      lastModified: attachment.file.lastModified,
    }));

    await saveAttachmentFiles(personId, data.quotationAttachments);

    await runTransaction(META_STORE, 'readwrite', (store) =>
      store.put({
        personId: draftKey(personId),
        registrationForm: data.registrationForm,
        selectedProjectId: data.selectedProjectId,
        attachmentPanelOpen: data.attachmentPanelOpen,
        attachments,
      }),
    );
  } catch {
    // ignore persistence errors (private mode, quota, etc.)
  }
}

/** 로그아웃·입력 초기화 — 전체 초기화 */
export async function clearBidDraftAll(personId: string): Promise<void> {
  try {
    await deleteAllAttachmentFilesForPerson(personId);
    await runTransaction(META_STORE, 'readwrite', (store) => store.delete(draftKey(personId)));
  } catch {
    // ignore
  }
}

export async function pruneRemovedAttachmentFiles(
  personId: string,
  currentAttachments: BidPartnerEntry[],
): Promise<void> {
  try {
    const meta = await runTransaction<StoredBidDraft & { personId: string }>(
      META_STORE,
      'readonly',
      (store) => store.get(draftKey(personId)),
    );
    if (!meta?.attachments?.length) return;

    const currentIds = new Set(currentAttachments.map((item) => item.id));
    const removedIds = meta.attachments
      .map((item) => item.id)
      .filter((id) => !currentIds.has(id));

    await deleteAttachmentFiles(removedIds);
  } catch {
    // ignore
  }
}
