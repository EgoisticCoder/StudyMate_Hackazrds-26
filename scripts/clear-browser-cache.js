#!/usr/bin/env node

/**
 * Manual browser cache clearing utility
 * Run this when switching between backends or experiencing cache issues
 * 
 * Usage: node scripts/clear-browser-cache.js
 */

console.log('🧹 Browser Cache Clearing Instructions\n');
console.log('Since browser caches can only be cleared from within the browser context,');
console.log('please follow these steps:\n');

console.log('📋 Option 1: Hard Reload (Recommended)');
console.log('  Firefox/Chrome: Ctrl+Shift+R (Cmd+Shift+R on Mac)');
console.log('  Safari: Cmd+Option+R\n');

console.log('📋 Option 2: Clear All Caches via DevTools');
console.log('  1. Open DevTools (F12)');
console.log('  2. Right-click the reload button → "Empty Cache and Hard Reload"');
console.log('  3. Or go to Application tab → Clear Storage → "Clear site data"\n');

console.log('📋 Option 3: Use Private/Incognito Window');
console.log('  This starts with a clean cache automatically\n');

console.log('📋 Option 4: Programmatic Clear (Already Integrated!)');
console.log('  The app now automatically detects backend URL changes');
console.log('  and clears cache on next load. Just restart the app.\n');

console.log('🔧 Your current configuration:');
console.log(`  EXPO_PUBLIC_PROXY_BASE_URL: ${process.env.EXPO_PUBLIC_PROXY_BASE_URL || '(not set - using localhost:3001)'}\n`);

console.log('✅ After clearing cache, restart your Expo dev server:');
console.log('   npx expo start -c\n');
