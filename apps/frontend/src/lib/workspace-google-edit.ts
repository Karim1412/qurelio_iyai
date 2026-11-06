import toast from 'react-hot-toast';

async function ensureBlobIsFileContent(blob: Blob): Promise<void> {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('Empty file');
  }
  if (blob.size < 12_000) {
    const probe = (await blob.slice(0, 2).text()).trimStart();
    if (probe.startsWith('{') || probe.startsWith('[')) {
      const text = await blob.text();
      let msg = 'Server did not return a file (check access and try again).';
      try {
        const j = JSON.parse(text) as { message?: string };
        if (typeof j.message === 'string' && j.message.trim()) msg = j.message;
      } catch {
        /* keep msg */
      }
      throw new Error(msg);
    }
  }
}

/**
 * Opens the stored file so you can see real content: PDFs and images in a new tab.
 * Word/Excel: downloads with the correct name (browsers usually cannot preview those in-tab);
 * use Downloads or upload to Google Drive / open in desktop Office.
 */
export async function openWorkspaceDocument(fetchBlob: () => Promise<{
  blob: Blob;
  fileName: string;
  mimeType: string;
}>) {
  try {
    const { blob, fileName, mimeType } = await fetchBlob();
    await ensureBlobIsFileContent(blob);

    const mt = (mimeType || '').toLowerCase();
    const lower = (fileName || '').toLowerCase();
    const isPdf = mt.includes('pdf') || lower.endsWith('.pdf');
    const isImage = mt.startsWith('image/');
    const isOffice =
      mt.includes('word') ||
      mt.includes('spreadsheet') ||
      mt.includes('excel') ||
      /\.(docx?|xlsx?|xls|pptx?)$/i.test(lower);

    const url = URL.createObjectURL(blob);
    const safeName = fileName?.trim() || 'document';

    if (isPdf || isImage) {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        toast.error('Allow pop-ups to view the file, or use Download.');
      }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }

    if (isOffice) {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(
        'File saved. Open it from your Downloads folder (Word/Excel), or upload it to Google Drive and use Open with Google Docs/Sheets.',
        { duration: 8000 },
      );
      return;
    }

    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Download started.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Could not open file';
    toast.error(m);
  }
}

const GOOGLE_DOCS_NEW = 'https://docs.google.com/document/create';
const GOOGLE_SHEETS_NEW = 'https://docs.google.com/spreadsheets/create';

/**
 * Downloads the file locally, opens a new blank Google Doc or Sheet (by type),
 * so the user can use File → Open in Google to load the downloaded file for editing.
 */
export async function openGoogleEditorFromWorkspaceFile(fetchBlob: () => Promise<{
  blob: Blob;
  fileName: string;
  mimeType: string;
}>) {
  try {
    const { blob, fileName, mimeType } = await fetchBlob();
    await ensureBlobIsFileContent(blob);

    const mt = (mimeType || '').toLowerCase();
    const lower = (fileName || '').toLowerCase();
    const isSheet =
      mt.includes('spreadsheet') ||
      mt.includes('excel') ||
      /\.(xlsx|xls|csv)$/i.test(lower);

    const url = URL.createObjectURL(blob);
    const safeName = fileName?.trim() || 'document';
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    const gUrl = isSheet ? GOOGLE_SHEETS_NEW : GOOGLE_DOCS_NEW;
    const w = window.open(gUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      toast.error('Allow pop-ups to open Google Docs or Sheets.');
      return;
    }
    toast.success(
      'File downloaded. In the new Google tab, use File → Open and pick the file from Downloads (or drag it into the tab).',
      { duration: 10_000 },
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Could not prepare Google edit';
    toast.error(m);
  }
}
