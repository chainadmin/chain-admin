#!/usr/bin/env node

/**
 * EAS Build Hook - Runs after npm install
 * 
 * This hook ensures proper mobile build setup:
 * 1. Builds web assets (Vite) for the mobile app
 * 2. Runs Capacitor sync to generate platform files including:
 *    - android/capacitor-cordova-android-plugins/ (gitignored, must be generated)
 *    - cordova.variables.gradle (required by Gradle build)
 * 3. Restores iOS shared scheme if cap sync overwrites it
 * 
 * Why this hook exists:
 * - The capacitor-cordova-android-plugins directory is gitignored
 * - EAS prebuildCommand doesn't generate it reliably
 * - Running in post-install ensures it happens after all dependencies are installed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Step 1: Build web assets for mobile app
console.log('🏗️  Building web assets...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Web assets built');
} catch (error) {
  console.error('❌ Web build failed:', error.message);
  process.exit(1);
}

// Step 2: Run Capacitor sync
console.log('🔄 Running Capacitor sync...');
try {
  execSync('npx cap sync', { stdio: 'inherit' });
  console.log('✅ Capacitor sync completed');
} catch (error) {
  console.error('❌ Capacitor sync failed:', error.message);
  process.exit(1);
}

// Step 3: Handle iOS shared scheme
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
