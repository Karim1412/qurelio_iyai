const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const backendPath = path.resolve(__dirname, '../src/regulatory-monitoring/regulatory_reference_catalog.json');
const frontendPath = path.resolve(__dirname, '../../../apps/frontend/src/data/regulatory_reference_catalog.json');
const backend = JSON.parse(fs.readFileSync(backendPath, 'utf8'));
const frontend = JSON.parse(fs.readFileSync(frontendPath, 'utf8'));
const canonical = (entry) => ({
  regulation_id: entry.regulation_id,
  reference: entry.reference,
  short_code: entry.short_code,
  aliases: entry.aliases ?? [],
  country_region: entry.country_region,
  industry: entry.industry ?? [],
  legal_status: entry.legal_status,
  source_url: entry.source_url,
});
const b = backend.catalog.map(canonical).sort((a, z) => a.regulation_id.localeCompare(z.regulation_id));
const f = frontend.catalog.map(canonical).sort((a, z) => a.regulation_id.localeCompare(z.regulation_id));
assert.deepEqual(b, f, 'backend candidate catalog and frontend reference catalog must stay aligned');
console.log(`Catalog parity OK: ${b.length} regulatory reference records (metadata equality checked).`);
