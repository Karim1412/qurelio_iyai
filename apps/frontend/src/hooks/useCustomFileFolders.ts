'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type CustomFileFolder = {
  id: string;
  name: string;
  createdAt: string;
  documentIds: string[];
  /** Local folder author (this browser) */
  createdByUserId?: string;
  createdByName?: string;
};

type Store = { folders: CustomFileFolder[] };

function storageKey(companyId: string | undefined) {
  return `qurelio-custom-file-folders-${companyId ?? 'global'}`;
}

function read(companyId: string | undefined): Store {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return { folders: [] };
    const p = JSON.parse(raw) as Store;
    if (!p || !Array.isArray(p.folders)) return { folders: [] };
    return {
      folders: p.folders.map((f) => ({
        id: String(f.id),
        name: String(f.name || 'Folder'),
        createdAt: String(f.createdAt || new Date().toISOString()),
        documentIds: Array.isArray(f.documentIds) ? f.documentIds.map(String) : [],
        createdByUserId: typeof f.createdByUserId === 'string' ? f.createdByUserId : undefined,
        createdByName: typeof f.createdByName === 'string' ? f.createdByName : undefined,
      })),
    };
  } catch {
    return { folders: [] };
  }
}

function write(companyId: string | undefined, store: Store) {
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function useCustomFileFolders(companyId: string | undefined) {
  const [store, setStore] = useState<Store>({ folders: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(read(companyId));
    setReady(true);
  }, [companyId]);

  const persist = useCallback(
    (next: Store) => {
      setStore(next);
      write(companyId, next);
    },
    [companyId],
  );

  const createFolder = useCallback(
    (name: string, author: { userId: string; displayName: string }) => {
      const n = name.trim() || 'New folder';
      const id = `cf-${Date.now()}`;
      const folder: CustomFileFolder = {
        id,
        name: n,
        createdAt: new Date().toISOString(),
        documentIds: [],
        createdByUserId: author.userId,
        createdByName: author.displayName,
      };
      persist({ folders: [folder, ...store.folders] });
      return id;
    },
    [persist, store.folders],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      const n = name.trim() || 'Folder';
      persist({
        folders: store.folders.map((f) => (f.id === id ? { ...f, name: n } : f)),
      });
    },
    [persist, store.folders],
  );

  const removeFolder = useCallback(
    (id: string) => {
      persist({ folders: store.folders.filter((f) => f.id !== id) });
    },
    [persist, store.folders],
  );

  const addDocumentToFolder = useCallback(
    (folderId: string, documentId: string) => {
      const docId = String(documentId);
      persist({
        folders: store.folders.map((f) => {
          if (f.id !== folderId) return f;
          if (f.documentIds.includes(docId)) return f;
          return { ...f, documentIds: [...f.documentIds, docId] };
        }),
      });
    },
    [persist, store.folders],
  );

  const removeDocumentFromFolder = useCallback(
    (folderId: string, documentId: string) => {
      const docId = String(documentId);
      persist({
        folders: store.folders.map((f) =>
          f.id !== folderId
            ? f
            : { ...f, documentIds: f.documentIds.filter((x) => x !== docId) },
        ),
      });
    },
    [persist, store.folders],
  );

  const assignedDocumentIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of store.folders) for (const id of f.documentIds) s.add(id);
    return s;
  }, [store.folders]);

  const getFolder = useCallback(
    (id: string) => store.folders.find((f) => f.id === id) ?? null,
    [store.folders],
  );

  return {
    ready,
    folders: store.folders,
    assignedDocumentIds,
    createFolder,
    renameFolder,
    removeFolder,
    addDocumentToFolder,
    removeDocumentFromFolder,
    getFolder,
  };
}
