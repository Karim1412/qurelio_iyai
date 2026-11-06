'use client';

import { use } from 'react';
import { FileEditorPage } from '@/components/file-manager/FileEditorPage';

export default function FileEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FileEditorPage docId={id} />;
}
