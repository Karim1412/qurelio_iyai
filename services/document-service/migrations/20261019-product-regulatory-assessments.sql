-- Qurelio: immutable, tenant-scoped applicability review history.
-- The current development TypeORM config uses synchronize=true. Apply this migration
-- in environments where schema synchronization is disabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS product_regulatory_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL,
  product_id varchar NOT NULL,
  regulation_id varchar NULL,
  reference varchar(500) NOT NULL,
  title varchar(1000) NULL,
  decision varchar(32) NOT NULL CHECK (decision IN ('APPLICABLE', 'CONDITIONAL', 'NOT_APPLICABLE', 'NEEDS_REVIEW')),
  rationale text NOT NULL,
  conditions text NULL,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url varchar(2048) NULL,
  source_version varchar(200) NULL,
  reviewer_id varchar NOT NULL,
  reviewer_role varchar(64) NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_regulatory_assessments_company_product_date
  ON product_regulatory_assessments (company_id, product_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_regulatory_assessments_company_product_regulation
  ON product_regulatory_assessments (company_id, product_id, regulation_id);
