#!/usr/bin/env node

/**
 * EAS Build Hook - Runs after install and Capacitor sync
 * Ensures iOS shared scheme exists after cap sync overwrites it
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCHEME_DIR = 'ios/App/App.xcworkspace/xcshareddata/xcschemes';
const SCHEME_FILE = path.join(SCHEME_DIR, 'App.xcscheme');

console.log('🔍 Checking for iOS shared scheme after Capacitor sync...');

// Create directory if it doesn't exist
if (!fs.existsSync(SCHEME_DIR)) {
  fs.mkdirSync(SCHEME_DIR, { recursive: true });
  console.log('✅ Created schemes directory');
}

// Check if scheme file exists
if (!fs.existsSync(SCHEME_FILE)) {
  console.log('⚠️  Scheme file missing (removed by cap sync), restoring...');
  
  try {
    // Restore from git
    execSync(`git checkout ${SCHEME_FILE}`, { stdio: 'inherit' });
    console.log('✅ Scheme restored from git after Capacitor sync');
  } catch (error) {
    console.error('❌ Could not restore scheme from git:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Scheme file exists after Capacitor sync');
}

// Verify the scheme is valid
try {
  const schemeContent = fs.readFileSync(SCHEME_FILE, 'utf8');
  if (!schemeContent.includes('BuildAction') || !schemeContent.includes('LaunchAction')) {
    throw new Error('Scheme file appears to be corrupted or incomplete');
  }
  console.log('✅ Scheme file is valid');
} catch (error) {
  console.error('❌ Scheme validation failed:', error.message);
  process.exit(1);
}
