/** Resolve human-readable ISO ↔ product labels for an evaluation row. */
export function formatEvaluationPair(
  ev: {
    isoStandard?: string;
    isoDocumentId?: string;
    productDocumentId?: string;
    productId?: string;
    productName?: string | null;
    requestSnapshot?: {
      productName?: string | null;
      productId?: string | null;
      isoDocumentId?: string;
      productDocumentId?: string;
      reportPack?: { product?: { name?: string | null } } | null;
    } | null;
  },
  isoNorms: { id: string; name?: string; isoStandard?: string }[],
  products: { id: string; name?: string; documents?: { id: string }[] }[],
  /** Optional flat document list (with productId / productName) when product folders don’t list every file. */
  documents?: { id: string; productId?: string | null; productName?: string | null }[],
): { isoLine: string; productLine: string; summary: string } {
  const snap = ev.requestSnapshot;
  const isoDocId = ev.isoDocumentId ?? snap?.isoDocumentId;
  const prodDocId = ev.productDocumentId ?? snap?.productDocumentId;
  const norm = isoNorms.find((n) => n.id === isoDocId);
  /** Short reference for UI (dropdown, table): not the long descriptive title. */
  const isoLine = norm
    ? norm.isoStandard || norm.name || 'ISO'
    : ev.isoStandard || '-';

  const packName = snap?.reportPack?.product?.name;
  const fromApi = [ev.productName, snap?.productName, packName].find(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );

  const snapProductId = typeof snap?.productId === 'string' ? snap.productId : undefined;
  const pid = ev.productId ?? snapProductId;

  let productLine = '-';
  if (fromApi) {
    productLine = fromApi.trim();
  } else if (pid) {
    const byId = products.find((p) => p.id === pid);
    if (byId?.name) {
      productLine = byId.name;
    } else {
      productLine = 'Product evidence';
    }
  } else if (prodDocId) {
    for (const p of products) {
      if ((p.documents ?? []).some((d) => d.id === prodDocId)) {
        productLine = p.name || 'Product';
        break;
      }
    }
    if (productLine === '-' && documents?.length) {
      const doc = documents.find((d) => d.id === prodDocId);
      if (doc?.productName) {
        productLine = doc.productName;
      } else if (doc?.productId) {
        const pr = products.find((p) => p.id === doc.productId);
        if (pr?.name) productLine = pr.name;
      }
    }
    if (productLine === '-') productLine = 'Product evidence';
  }

  return {
    isoLine,
    productLine,
    summary: `${isoLine} ↔ ${productLine}`,
  };
}
