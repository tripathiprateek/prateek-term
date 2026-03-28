/**
 * Prateek-Term — afterPack hook
 *
 * Applies an ad-hoc code signature after packing but before DMG creation.
 * Without any signature, macOS Gatekeeper shows "damaged and can't be opened"
 * for apps downloaded from the internet. An ad-hoc signature (--sign -)
 * changes this to the bypassable "unverified developer" prompt — users can
 * right-click → Open to install once and macOS remembers the approval.
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'pipe' });
    console.log(`  ✓ Ad-hoc signed: ${appName}.app`);
  } catch (e) {
    console.warn(`  ⚠ codesign failed (non-fatal): ${e.stderr?.toString().trim() || e.message}`);
  }
};
