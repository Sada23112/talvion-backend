/**
 * @file    migrateLegacyUsers.js
 * @desc    Production-ready idempotent migration script for Talvion.
 *          Backfills Phase 1 administrative fields to all legacy user documents.
 *          Safe to run multiple times — only updates documents missing required fields.
 *          Runs automatically on backend startup.
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

// Fields required by the Phase 1 admin schema and their default values
const REQUIRED_FIELDS = {
  role: 'user',
  status: 'active',
  statusReason: '',
  statusUntil: null,
  isVerified: false,
  moderationNotes: ''
};

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

/**
 * Main migration function that can be executed as a CLI command or programmatically.
 * @param {Object} options
 * @param {boolean} options.dryRun - Run in simulation mode (no writes)
 * @param {boolean} options.closeConnection - Close the Mongoose connection at the end (for CLI usage)
 */
async function migrateLegacyUsers({ dryRun = false, closeConnection = false } = {}) {
  const report = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: []
  };

  const isOffline = process.env.DB_OFFLINE === 'true';

  console.log('\n=====================================================');
  console.log(`TALVION LEGACY USER MIGRATION${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('=====================================================');

  if (isOffline) {
    // Offline Mock Migration
    const fs = require('fs');

    // Helper to migrate a path
    const migrateJsonFile = (filePath) => {
      if (!fs.existsSync(filePath)) {
        return;
      }
      try {
        let users = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const wasArray = Array.isArray(users);
        if (!wasArray) users = users ? [users] : [];
        report.total += users.length;

        let changed = false;
        users = users.map(user => {
          const missing = getMissingFields(user);
          if (Object.keys(missing).length === 0) {
            report.skipped++;
            return user;
          }
          if (!dryRun) {
            changed = true;
            report.updated++;
            return { ...user, ...missing };
          } else {
            report.updated++;
            return user;
          }
        });

        if (changed && !dryRun) {
          fs.writeFileSync(filePath, JSON.stringify(wasArray ? users : users[0], null, 2));
        }
      } catch (e) {
        console.error(`❌ Failed to migrate mock file ${filePath}: ${e.message}`);
        report.errors++;
      }
    };

    // Migrate mock-admin.json
    migrateJsonFile(path.resolve(__dirname, '../mock-admin.json'));

    // Migrate mock-db.json
    const mockDbPath = path.resolve(__dirname, '../mock-db.json');
    if (fs.existsSync(mockDbPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
        if (raw.users && Array.isArray(raw.users)) {
          report.total += raw.users.length;
          let changed = false;
          raw.users = raw.users.map(user => {
            const missing = getMissingFields(user);
            if (Object.keys(missing).length === 0) {
              report.skipped++;
              return user;
            }
            if (!dryRun) {
              changed = true;
              report.updated++;
              return { ...user, ...missing };
            } else {
              report.updated++;
              return user;
            }
          });

          if (changed && !dryRun) {
            fs.writeFileSync(mockDbPath, JSON.stringify(raw, null, 2));
          }
        }
      } catch (e) {
        console.error(`❌ Failed to migrate mock-db.json: ${e.message}`);
        report.errors++;
      }
    }
  } else {
    // MongoDB Live Migration
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/talvion';

    // Apply DNS fallback for Atlas if connecting fresh
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
      if (mongoURI.startsWith('mongodb+srv://')) {
        try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (_) {}
      }
      console.log('Connecting to MongoDB for migration...');
      await mongoose.connect(mongoURI);
    }

    const User = require('../src/models/user.model');

    const missingQuery = {
      $or: Object.keys(REQUIRED_FIELDS).map(field => ({ [field]: { $exists: false } }))
    };

    report.total = await User.countDocuments({});
    const legacyCursor = User.find(missingQuery).lean().cursor();

    for await (const doc of legacyCursor) {
      const missing = getMissingFields(doc);
      if (Object.keys(missing).length === 0) {
        report.skipped++;
        continue;
      }

      if (dryRun) {
        report.updated++;
        continue;
      }

      try {
        await User.updateOne({ _id: doc._id }, { $set: missing });
        report.updated++;
      } catch (err) {
        console.error(`❌ Error updating user ${doc.email || doc._id}: ${err.message}`);
        report.errors++;
        report.errorDetails.push({ id: doc._id, email: doc.email, error: err.message });
      }
    }

    // Post-migration validation (only if not dry run)
    if (!dryRun) {
      let validationPassed = true;
      for (const field of Object.keys(REQUIRED_FIELDS)) {
        const remaining = await User.countDocuments({ [field]: { $exists: false } });
        if (remaining > 0) {
          console.error(`❌ Verification failed: ${remaining} user(s) still missing "${field}"`);
          validationPassed = false;
        }
      }
      if (validationPassed) {
        console.log('✅ Verification passed: All users comply with the Phase 1 schema.');
      }
    }

    if (closeConnection) {
      await mongoose.connection.close();
    }
  }

  // Log summary
  console.log('\nMIGRATION SUMMARY:');
  console.log(`- Total users scanned : ${report.total}`);
  console.log(`- Users updated       : ${report.updated}`);
  console.log(`- Users skipped       : ${report.skipped}`);
  console.log(`- Errors              : ${report.errors}`);
  console.log('=====================================================\n');

  if (report.errors > 0 && closeConnection) {
    process.exit(1);
  }
}

// Execute immediately if run via command line
if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateLegacyUsers({ dryRun: isDryRun, closeConnection: true }).catch(err => {
    console.error(`❌ Unhandled migration error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { migrateLegacyUsers };
