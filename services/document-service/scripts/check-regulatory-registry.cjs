#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const registryPath = path.join(__dirname, '..', 'src', 'regulatory-monitoring', 'source-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const rows = registry.sources;
const errors = [];
const ids = new Set();
const urls = new Map();
const requiredStrings = [
  'sourceId', 'regionGroup', 'jurisdiction', 'regulatoryDomain', 'sourceName', 'officialUrl',
  'publisherType', 'sourceClass', 'contentToMonitor', 'preferredDetectionMethod',
  'suggestedCheckCadence', 'priority', 'automationNotes', 'accessLicensingNotes',
  'recommendedAiUse', 'verificationStatus',
];

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('Registry must contain a non-empty sources array');
}

for (const [index, row] of rows.entries()) {
  const where = `${index + 1}. ${row.sourceId || '(missing sourceId)'}`;
  for (const key of requiredStrings) {
    if (typeof row[key] !== 'string' || row[key].trim().length === 0) errors.push(`${where}: ${key} is required`);
  }
  if (row.sourceId) {
    if (ids.has(row.sourceId)) errors.push(`${where}: duplicate sourceId`);
    ids.add(row.sourceId);
  }
  if (row.priority && !['P0', 'P1', 'P2', 'P3'].includes(row.priority)) {
    errors.push(`${where}: priority must be P0, P1, P2, or P3`);
  }
  if (row.officialUrl) {
    try {
      const url = new URL(row.officialUrl);
      if (url.protocol !== 'https:' || url.username || url.password) errors.push(`${where}: officialUrl must use public HTTPS without embedded credentials`);
      url.hash = '';
      if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
      const normalized = url.toString();
      urls.set(normalized, (urls.get(normalized) || 0) + 1);
    } catch {
      errors.push(`${where}: officialUrl is invalid`);
    }
  }
}

const duplicateEndpoints = [...urls.entries()].filter(([, count]) => count > 1);
console.log(`Registry version: ${registry.sourceRegistryVersion || 'unknown'}`);
console.log(`Source records: ${rows.length}`);
console.log(`Unique source IDs: ${ids.size}`);
console.log(`Unique normalized endpoint URLs: ${urls.size}`);
console.log(`Shared endpoint groups requiring review: ${duplicateEndpoints.length}`);
for (const [url, count] of duplicateEndpoints) console.warn(`WARN ${count} records share endpoint ${url}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log('PASS: required registry fields, IDs, priorities, and HTTPS URLs are valid.');
}
