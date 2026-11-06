-- Respect the tutor-provided source cadence while ensuring no source is checked less
-- frequently than once per seven days. Existing non-default schedules are preserved
-- as manual choices; the old weekly default will adopt workbook guidance at startup.
ALTER TABLE regulatory_monitor_sources
  ADD COLUMN IF NOT EXISTS check_interval_manually_configured boolean NOT NULL DEFAULT false;

UPDATE regulatory_monitor_sources
SET check_interval_manually_configured = true
WHERE check_interval_hours <> 168;

-- The product requirement caps the interval at seven days. Previously this could be 30 days.
UPDATE regulatory_monitor_sources SET check_interval_hours = 168 WHERE check_interval_hours > 168;
ALTER TABLE regulatory_monitor_sources
  DROP CONSTRAINT IF EXISTS regulatory_monitor_sources_check_interval_hours_check;
ALTER TABLE regulatory_monitor_sources
  DROP CONSTRAINT IF EXISTS chk_regulatory_monitor_source_interval;
ALTER TABLE regulatory_monitor_sources
  ADD CONSTRAINT chk_regulatory_monitor_source_interval
  CHECK (check_interval_hours BETWEEN 1 AND 168);
