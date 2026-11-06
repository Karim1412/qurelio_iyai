import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Document } from '../database/entities/document.entity';

/**
 * RAG service: extraction + structured JSON + vectors. Document-service triggers /api/ingest;
 * RAG PATCHes results back via internal route.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(private readonly config: ConfigService) {}

  /** Set RAG_INGEST_ENABLED=false when not using RAG (no extraction pipeline). */
  private get ingestEnabled(): boolean {
    const v = this.config.get<string>('RAG_INGEST_ENABLED', 'true')?.toLowerCase();
    return v !== 'false' && v !== '0' && v !== 'no';
  }

  private get ragUrl() {
    return this.config.get('RAG_SERVICE_URL', 'http://rag-service:8000');
  }

  private logAxiosFailure(context: string, e: any): void {
    const code = e?.code ?? e?.cause?.code;
    const msg = e?.message ?? String(e);
    const unreachable =
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN' ||
      /ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg);
    if (unreachable) {
      this.logger.debug(
        `${context}: RAG unreachable (${msg}). Start rag-service or set RAG_INGEST_ENABLED=false.`,
      );
      return;
    }
    this.logger.warn(`${context}: ${msg}`);
  }

  /** Queue full pipeline on RAG (202 Accepted); RAG calls back with extraction + then indexes vectors. */
  async postIngestJob(doc: Document): Promise<void> {
    if (!this.ingestEnabled) {
      throw new Error('RAG_INGEST_ENABLED is false');
    }
    await axios.post(
      `${this.ragUrl}/api/ingest`,
      {
        document_id: doc.id,
        company_id: doc.companyId,
        storage_key: doc.storageKey,
        mime_type: doc.mimeType,
        doc_type: doc.type,
        iso_standard: doc.isoStandard ?? null,
        file_name: doc.name,
        version: doc.version,
        description: doc.description ?? null,
      },
      {
        // /api/ingest is an enqueue endpoint and must acknowledge quickly.
        // Never keep the document-upload request open for the full extraction job.
        // Long-running PDF/LLM work continues asynchronously in rag-service.
        timeout: 15_000,
        validateStatus: (s) => s === 202 || s === 200,
      },
    );
    this.logger.log(`RAG extraction queued for doc ${doc.id}`);
  }

  onDocumentDeleted(docId: string, companyId: string): void {
    if (!this.ingestEnabled) return;
    axios
      .delete(`${this.ragUrl}/api/documents/${companyId}/${docId}`)
      .catch((e) => this.logAxiosFailure(`Vector delete failed for ${docId}`, e));
  }

  /** STD-006: index clause text in tenant namespace after QM activates the standard. */
  async postIndexStandardClauseText(payload: {
    documentId: string;
    companyId: string;
    text: string;
    isoStandard?: string;
    docType: string;
    fileName?: string;
    version?: number;
    sections?: Array<Record<string, any>>;
  }): Promise<void> {
    if (!this.ingestEnabled) {
      throw new Error('RAG_INGEST_ENABLED is false');
    }
    await axios.post(
      `${this.ragUrl}/api/index-standard`,
      {
        document_id: payload.documentId,
        company_id: payload.companyId,
        text: payload.text,
        iso_standard: payload.isoStandard ?? null,
        doc_type: payload.docType,
        file_name: payload.fileName ?? null,
        version: payload.version ?? null,
        sections: payload.sections ?? null,
      },
      { timeout: 120_000, validateStatus: (s) => s === 200 || s === 202 },
    );
    this.logger.log(`Clause vectors queued for standard ${payload.documentId}`);
  }
}
