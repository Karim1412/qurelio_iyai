-- Qurelio regulatory source monitoring.
-- Apply with the document service stopped before deploying the code.
-- Existing project configuration still has TypeORM synchronize=true for legacy tables;
-- production deployments must apply migrations explicitly and plan the broader synchronize=false migration separately.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS product_regulatory_assessments
  ADD COLUMN IF NOT EXISTS monitored_source_id varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS source_snapshot_hash_at_review varchar(64) NULL;

CREATE TABLE IF NOT EXISTS regulatory_monitor_sources (
  source_id varchar(32) PRIMARY KEY,
  region_group varchar(100) NOT NULL,
  jurisdiction varchar(160) NOT NULL,
  regulatory_domain varchar(240) NOT NULL,
  source_name varchar(500) NOT NULL,
  official_url varchar(2048) NOT NULL,
  publisher_type text NOT NULL,
  source_class text NOT NULL,
  content_to_monitor text NOT NULL,
  preferred_detection_method text NOT NULL,
  suggested_check_cadence varchar(200) NOT NULL,
  priority varchar(8) NOT NULL,
  automation_notes text NOT NULL,
  access_licensing_notes text NOT NULL,
  recommended_ai_use text NOT NULL,
  verification_status text NOT NULL,
  check_interval_hours integer NOT NULL DEFAULT 168 CHECK (check_interval_hours BETWEEN 1 AND 168),
  check_interval_manually_configured boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  check_status varchar(32) NOT NULL DEFAULT 'NEVER_CHECKED',
  last_attempt_at timestamptz NULL,
  last_checked_at timestamptz NULL,
  next_check_at timestamptz NULL,
  last_http_status integer NULL,
  last_error text NULL,
  last_etag text NULL,
  last_modified_header text NULL,
  last_content_hash varchar(64) NULL,
  last_content_snapshot text NULL,
  last_link_inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_failure_count integer NOT NULL DEFAULT 0,
  last_change_detected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_monitor_sources_enabled_next
  ON regulatory_monitor_sources (enabled, next_check_at);
CREATE INDEX IF NOT EXISTS idx_regulatory_monitor_sources_jurisdiction_priority
  ON regulatory_monitor_sources (jurisdiction, priority);

CREATE TABLE IF NOT EXISTS regulatory_source_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id varchar(32) NOT NULL REFERENCES regulatory_monitor_sources(source_id) ON DELETE CASCADE,
  status varchar(32) NOT NULL CHECK (status IN ('BASELINE_CAPTURED', 'UNCHANGED', 'POTENTIAL_CHANGE', 'ERROR')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  http_status integer NULL,
  final_url varchar(2048) NULL,
  previous_hash varchar(64) NULL,
  current_hash varchar(64) NULL,
  change_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regulatory_source_checks_source_started
  ON regulatory_source_checks (source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS regulatory_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id varchar(32) NOT NULL REFERENCES regulatory_monitor_sources(source_id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES regulatory_source_checks(id) ON DELETE CASCADE,
  source_name varchar(500) NOT NULL,
  source_url varchar(2048) NOT NULL,
  priority varchar(8) NOT NULL,
  detected_at timestamptz NOT NULL,
  title varchar(500) NOT NULL,
  summary text NOT NULL,
  change_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_hash varchar(64) NULL,
  after_hash varchar(64) NOT NULL,
  change_excerpt text NULL,
  state varchar(32) NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (state IN ('NEEDS_REVIEW', 'CONFIRMED_CHANGE', 'NOT_REGULATORY_CHANGE')),
  reviewed_by varchar(128) NULL,
  reviewed_at timestamptz NULL,
  review_note text NULL,
  notifications_created integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regulatory_change_events_state_detected
  ON regulatory_change_events (state, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_change_events_source_detected
  ON regulatory_change_events (source_id, detected_at DESC);

-- Tenant-specific impact reviews. A company's decision must never overwrite the shared source event.
CREATE TABLE IF NOT EXISTS regulatory_change_event_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES regulatory_change_events(id) ON DELETE CASCADE,
  company_id varchar NOT NULL,
  state varchar(32) NOT NULL CHECK (state IN ('ACTION_REQUIRED', 'NO_PRODUCT_IMPACT')),
  reviewed_by varchar(128) NOT NULL,
  reviewer_role varchar(64) NOT NULL,
  review_note text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regulatory_change_reviews_company_event_reviewed
  ON regulatory_change_event_reviews (company_id, event_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_change_reviews_company_state_reviewed
  ON regulatory_change_event_reviews (company_id, state, reviewed_at DESC);
