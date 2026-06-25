/**
 * @file    migrateLegacyUsers.js
 * @desc    Production-ready idempotent migration script for Talvion.
 *          Backfills Phase 1 administrative fields to all legacy user documents.
 *          Safe to run multiple times — only updates documents missing required fields.
 *
 * Usage:
 *   Dry run (no DB changes):  node scripts/migrateLegacyUsers.js --dry-run
 *   Live run:                 node scripts/migrateLegacyUsers.js
 *   Via npm:                  npm run migrate:users
 *   Dry run via npm:          npm run migrate:users -- --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const dns = require('dns');

// ─── Configuration ────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// Fields required by the Phase 1 admin schema and their default values
const REQUIRED_FIELDS = {
  role: 'user',
  status: 'active',
  statusReason: '',
  statusUntil: null,
  isVerified: false,
  moderationNotes: ''
};

// ─── Counters ─────────────────────────────────────────────────────────────────

const report = {
  total: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  errorDetails: []
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function logError(msg) { console.error(msg); }

function separator(char = '─', len = 55) {
  return char.repeat(len);
}

/**
 * Determine which required fields are missing from a raw document object.
 * @param {Object} doc - Plain object representation of a user document
 * @returns {Object} - Subset of REQUIRED_FIELDS that are missing
 */
function getMissingFields(doc) {
  const missing = {};
  for (const [field, defaultValue] of Object.entries(REQUIRED_FIELDS)) {
    if (doc[field] === undefined || doc[field] === null && field !== 'statusUntil') {
      // statusUntil is legitimately null — only flag if undefined
      if (field === 'statusUntil' && doc[field] === null) continue;
      if (doc[field] === undefined) {
        missing[field] = defaultValue;
      }
    }
  }
  return missing;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  log('');
  log(separator('═'));
  log('  TALVION — LEGACY USER MIGRATION');
  if (DRY_RUN) log('  ⚠️  DRY RUN MODE — No changes will be written to the database.');
  log(separator('═'));
  log('');

  const isOffline = process.env.DB_OFFLINE === 'true';

  if (isOffline) {
    await runMockMigration();
  } else {
    await runMongoMigration();
  }
}

// ─── MongoDB Live Migration ────────────────────────────────────────────────────

async function runMongoMigration() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/talvion';

  // Apply the same DNS fix as db.js for Atlas SRV records
  if (mongoURI.startsWith('mongodb+srv://')) {
    try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (_) {}
  }

  log('Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoURI);
    log(`✅  Connected: ${mongoose.connection.host}`);
    log('');
  } catch (err) {
    logError(`❌  Connection failed: ${err.message}`);
    process.exit(1);
  }

  // Load model AFTER connection is established
  const User = require('../src/models/user.model');

  // Build a query that matches any document missing at least one required field
  const missingQuery = {
    $or: Object.keys(REQUIRED_FIELDS).map(field => ({ [field]: { $exists: false } }))
  };

  // Count total users in the collection
  report.total = await User.countDocuments({});
  const legacyCursor = User.find(missingQuery).lean().cursor();

  log(`📊  Total users in database: ${report.total}`);
  log(`🔍  Scanning for documents with missing fields...`);
  log('');

  // Process each legacy document individually for granular reporting
  for await (const doc of legacyCursor) {
    const missing = getMissingFields(doc);

    if (Object.keys(missing).length === 0) {
      report.skipped++;
      continue;
    }

    log(`  → Found legacy user: ${doc.email || doc._id}`);
    log(`    Missing fields: ${Object.keys(missing).join(', ')}`);

    if (DRY_RUN) {
      log(`    [DRY RUN] Would set: ${JSON.stringify(missing)}`);
      report.updated++;
      continue;
    }

    try {
      await User.updateOne(
        { _id: doc._id },
        { $set: missing }
      );
      log(`    ✅  Updated successfully.`);
      report.updated++;
    } catch (err) {
      logError(`    ❌  Error updating ${doc.email}: ${err.message}`);
      report.errors++;
      report.errorDetails.push({ id: doc._id, email: doc.email, error: err.message });
    }
  }

  // ── Post-Migration Verification ─────────────────────────────────────────────
  if (!DRY_RUN) {
    log('');
    log(separator());
    log('  VERIFICATION');
    log(separator());
    log('');

    let verificationPassed = true;
    for (const field of Object.keys(REQUIRED_FIELDS)) {
      const remaining = await User.countDocuments({ [field]: { $exists: false } });
      if (remaining > 0) {
        logError(`  ❌  ${remaining} user(s) still missing field: "${field}"`);
        verificationPassed = false;
      } else {
        log(`  ✅  All users have field: "${field}"`);
      }
    }

    log('');
    if (verificationPassed) {
      log('  ✅  VERIFICATION PASSED — All users comply with the Phase 1 schema.');
    } else {
      logError('  ❌  VERIFICATION FAILED — Some documents still have missing fields.');
      logError('      Please inspect the errors above and re-run the migration.');
    }
  }

  printReport();

  await mongoose.connection.close();
  log('');
  log('Connection closed. Migration complete.');
  log('');
  process.exit(report.errors > 0 ? 1 : 0);
}

// ─── Mock DB Offline Migration ─────────────────────────────────────────────────

async function runMockMigration() {
  const fs = require('fs');

  // Migrate mock-admin.json
  const mockAdminPath = path.resolve(__dirname, '../mock-admin.json');
  migrateJsonFile(mockAdminPath, fs);

  // Migrate the main mock DB users file if it exists
  const mockDbPath = path.resolve(__dirname, '../mock-db.json');
  if (fs.existsSync(mockDbPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
      if (raw.users && Array.isArray(raw.users)) {
        const { updated, skipped } = migrateUserArray(raw.users, fs, mockDbPath, raw);
        report.total += raw.users.length;
        report.updated += updated;
        report.skipped += skipped;
      }
    } catch (e) {
      logError(`❌  Failed to migrate mock-db.json: ${e.message}`);
      report.errors++;
    }
  }

  printReport();
  process.exit(report.errors > 0 ? 1 : 0);
}

function migrateJsonFile(filePath, fs) {
  if (!fs.existsSync(filePath)) {
    log(`ℹ️   File not found, skipping: ${filePath}`);
    return;
  }

  try {
    let users = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(users)) users = users ? [users] : [];
    report.total += users.length;

    let changed = false;
    users = users.map(user => {
      const missing = getMissingFields(user);
      if (Object.keys(missing).length === 0) {
        report.skipped++;
        return user;
      }
      log(`  → Migrating mock user: ${user.email}`);
      log(`    Missing fields: ${Object.keys(missing).join(', ')}`);
      if (!DRY_RUN) {
        changed = true;
        report.updated++;
        return { ...user, ...missing };
      } else {
        log(`    [DRY RUN] Would set: ${JSON.stringify(missing)}`);
        report.updated++;
        return user;
      }
    });

    if (changed && !DRY_RUN) {
      fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
      log(`  ✅  Saved: ${filePath}`);
    }
  } catch (e) {
    logError(`❌  Failed to migrate ${filePath}: ${e.message}`);
    report.errors++;
  }
}

function migrateUserArray(users, fs, filePath, rawData) {
  let updatedCount = 0;
  let skippedCount = 0;
  let changed = false;

  const migrated = users.map(user => {
    const missing = getMissingFields(user);
    if (Object.keys(missing).length === 0) {
      skippedCount++;
      return user;
    }
    log(`  → Migrating mock DB user: ${user.email}`);
    if (!DRY_RUN) {
      changed = true;
      updatedCount++;
      return { ...user, ...missing };
    } else {
      log(`    [DRY RUN] Would set: ${JSON.stringify(missing)}`);
      updatedCount++;
      return user;
    }
  });

  if (changed && !DRY_RUN) {
    fs.writeFileSync(filePath, JSON.stringify({ ...rawData, users: migrated }, null, 2));
  }

  return { updated: updatedCount, skipped: skippedCount };
}

// ─── Report Printer ───────────────────────────────────────────────────────────

function printReport() {
  log('');
  log(separator('═'));
  log('  MIGRATION REPORT' + (DRY_RUN ? ' (DRY RUN)' : ''));
  log(separator('─'));
  log(`  Total users scanned  : ${report.total}`);
  log(`  Users updated        : ${report.updated}${DRY_RUN ? ' (simulated)' : ''}`);
  log(`  Users skipped        : ${report.skipped} (already compliant)`);
  log(`  Errors               : ${report.errors}`);

  if (report.errorDetails.length > 0) {
    log('');
    log('  Error Details:');
    for (const e of report.errorDetails) {
      logError(`    • ${e.email} (${e.id}): ${e.error}`);
    }
  }

  log(separator('═'));
  log('');
}

// ─── Entry ────────────────────────────────────────────────────────────────────

run().catch(err => {
  logError(`\n❌  Unhandled migration error: ${err.message}`);
  process.exit(1);
});
