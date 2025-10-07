#!/usr/bin/env node

/**
 * EAS Build Hook - Runs before install
 * Ensures iOS shared scheme exists
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCHEME_DIR = 'ios/App/App.xcodeproj/xcshareddata/xcschemes';
const SCHEME_FILE = path.join(SCHEME_DIR, 'App.xcscheme');

console.log('🔍 Checking for iOS shared scheme...');

// Create directory if it doesn't exist
if (!fs.existsSync(SCHEME_DIR)) {
  fs.mkdirSync(SCHEME_DIR, { recursive: true });
  console.log('✅ Created schemes directory');
}

// Check if scheme file exists
if (!fs.existsSync(SCHEME_FILE)) {
  console.log('⚠️  Scheme file missing, attempting to restore...');
  
  try {
    // Try to restore from git
    execSync(`git checkout ${SCHEME_FILE}`, { stdio: 'inherit' });
    console.log('✅ Scheme restored from git');
  } catch (error) {
    console.error('❌ Could not restore scheme from git:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Scheme file exists');
}
