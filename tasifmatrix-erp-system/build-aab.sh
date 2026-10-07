#!/usr/bin/env bash
#
# Builds the signed Android App Bundle (.aab) of Tasif Matrix ERP for Google Play.
#
#   cd "~/Desktop/Sompriti Enterprice Project/tasifmatrix-erp-system"
#   ./build-aab.sh
#
# First run: creates your upload key in ~/tasifmatrix-keys (asks for a password). BACK THAT FOLDER
# UP - every future update on Google Play must be signed with the same key.
#
# Every run gets a higher version code automatically (Google Play refuses a code it has seen).
# The version name comes from frontend/src/app/core/app-info.ts. Override either with:
#   VERSION_CODE=42 VERSION_NAME=1.0.1 ./build-aab.sh
#
# Needs: Node 22.22.3+ or 24+, a JDK 21, and the Android SDK (installed by Android Studio).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/frontend"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mx %s\033[0m\n' "$1" >&2; exit 1; }

KEY_DIR="${TM_KEY_DIR:-$HOME/tasifmatrix-keys}"
KEY_PROPS="$KEY_DIR/keystore.properties"
APP_ID="$(grep -o "appId: *'[^']*'" capacitor.config.ts | cut -d"'" -f2)"
[ -n "$APP_ID" ] || fail "Could not read appId from frontend/capacitor.config.ts."

# ---------------------------------------------------------------- prerequisites
command -v node >/dev/null || fail "Node is not installed. Try: nvm use 24"
grep -q "apiBaseUrl: .*CHANGE-ME" src/environments/environment.mobile.ts \
  && fail "Set apiBaseUrl in frontend/src/environments/environment.mobile.ts to your server first."
grep -q "apiBaseUrl: 'http://" src/environments/environment.mobile.ts \
  && fail "environment.mobile.ts points at a plain http:// address. A Play Store build must use your https server."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $(node -v) is too old for Angular. Try: nvm use 24"

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[ -d "$SDK_DIR" ] || fail "Android SDK not found at $SDK_DIR.
   Open Android Studio once and let it finish its first-run setup, or set ANDROID_HOME."

is_jdk21() { [ -x "$1/bin/javac" ] && "$1/bin/java" -version 2>&1 | grep -q '"21'; }
JDK21=""
for candidate in "${JAVA_HOME:-}" \
                 "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" \
                 "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
                 "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
                 /Library/Java/JavaVirtualMachines/*21*/Contents/Home \
                 /opt/homebrew/opt/openjdk@21 \
                 "$HOME/Library/Java/JavaVirtualMachines"/*21*/Contents/Home; do
  if [ -n "$candidate" ] && is_jdk21 "$candidate"; then JDK21="$candidate"; break; fi
done
[ -n "$JDK21" ] || fail "No JDK 21 found - Capacitor 8 needs one.
   Fix with either:  brew install --cask temurin@21   or open Android Studio once."
export JAVA_HOME="$JDK21"
export PATH="$JAVA_HOME/bin:$PATH"

VERSION_NAME="${VERSION_NAME:-$(grep -o "version: *'[^']*'" src/app/core/app-info.ts | head -1 | cut -d"'" -f2)}"
# Minutes since 1970: always higher than the last build, and well below Google's limit.
VERSION_CODE="${VERSION_CODE:-$(( $(date +%s) / 60 ))}"

step "$APP_ID $VERSION_NAME (code $VERSION_CODE) · JDK 21 · SDK at $SDK_DIR"

# ---------------------------------------------------------------- upload key (once)
if [ ! -f "$KEY_PROPS" ]; then
  step "Creating your upload key (one time)"
  echo "    It is saved in $KEY_DIR. Google Play needs the same key for every update:"
  echo "    copy that folder somewhere safe (a USB drive or a password manager)."
  mkdir -p "$KEY_DIR"; chmod 700 "$KEY_DIR"
  while true; do
    read -r -s -p "    Choose a password for the key (at least 8 characters): " TM_PASS; echo
    read -r -s -p "    Type it again: " TM_PASS2; echo
    [ "${#TM_PASS}" -ge 8 ] && [ "$TM_PASS" = "$TM_PASS2" ] && break
    warn "The passwords did not match or were too short. Try again."
  done
  export TM_PASS
  keytool -genkeypair -noprompt \
    -keystore "$KEY_DIR/upload-keystore.jks" -storetype PKCS12 \
    -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass:env TM_PASS -keypass:env TM_PASS \
    -dname "CN=Tasif Matrix Limited, O=Tasif Matrix Limited, L=Dhaka, C=BD"
  # Readable by you only.
  ( umask 077
    printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=upload\nkeyPassword=%s\n' \
      "$KEY_DIR/upload-keystore.jks" "$TM_PASS" "$TM_PASS" > "$KEY_PROPS" )
  unset TM_PASS TM_PASS2
  echo "    Upload key created."
fi

# ---------------------------------------------------------------- build the web app
step "Installing dependencies"
npm install --no-audit --no-fund

step "Building the Angular app for mobile"
npm run build:mobile
printf '    API it will call: '
grep -o "apiBaseUrl: '[^']*'" src/environments/environment.mobile.ts | cut -d"'" -f2

# ---------------------------------------------------------------- native project
# The package name is permanent on Google Play, so the Android project must use the one in
# capacitor.config.ts. A project generated under an older name is set aside and made again.
if [ -d android ] && ! grep -q "applicationId \"$APP_ID\"" android/app/build.gradle; then
  OLD="android.old-$(date +%Y%m%d%H%M%S)"
  warn "The Android project uses an old package name; recreating it as $APP_ID (old copy kept in frontend/$OLD)."
  mv android "$OLD"
fi
if [ ! -d android ]; then
  step "Creating the Android project"
  npx cap add android
  step "Generating launcher icons and the splash screen"
  npx @capacitor/assets generate --android || echo "    (skipped - icons can be generated later)"
fi

echo "sdk.dir=$SDK_DIR" > android/local.properties

# Release signing and version, read from the key folder - nothing secret goes into the project.
if ! grep -q ">>> tasifmatrix release" android/app/build.gradle; then
  cat >> android/app/build.gradle <<'EOF'

// >>> tasifmatrix release (added by build-aab.sh)
def tmKeys = new Properties()
def tmKeysFile = file(System.getenv('TM_KEYSTORE_PROPERTIES') ?: "${System.getProperty('user.home')}/tasifmatrix-keys/keystore.properties")
if (tmKeysFile.exists()) { tmKeysFile.withInputStream { tmKeys.load(it) } }
android {
    defaultConfig {
        if (project.hasProperty('tmVersionCode')) { versionCode = Integer.parseInt(project.property('tmVersionCode').toString()) }
        if (project.hasProperty('tmVersionName')) { versionName = project.property('tmVersionName').toString() }
    }
    if (tmKeysFile.exists()) {
        signingConfigs {
            release {
                storeFile file(tmKeys['storeFile'])
                storePassword tmKeys['storePassword']
                keyAlias tmKeys['keyAlias']
                keyPassword tmKeys['keyPassword']
            }
        }
        buildTypes { release { signingConfig signingConfigs.release } }
    }
}
// <<< tasifmatrix release
EOF
fi

step "Syncing the web build into the Android project"
npx cap sync android

# ---------------------------------------------------------------- bundle
step "Building the signed bundle"
cd android
TM_KEYSTORE_PROPERTIES="$KEY_PROPS" ./gradlew -Dorg.gradle.java.installations.paths="$JAVA_HOME" \
  -PtmVersionCode="$VERSION_CODE" -PtmVersionName="$VERSION_NAME" clean bundleRelease

AAB="$PWD/app/build/outputs/bundle/release/app-release.aab"
[ -f "$AAB" ] || fail "Gradle finished but the bundle is missing."
jarsigner -verify "$AAB" 2>/dev/null | grep -q "jar verified" || fail "The bundle is not signed. Check $KEY_PROPS."

mkdir -p "$ROOT/release"
OUT="$ROOT/release/tasifmatrix-erp-$VERSION_NAME-$VERSION_CODE.aab"
cp "$AAB" "$OUT"

printf '\n\033[1;32m✓ Bundle ready for Google Play\033[0m\n  %s (%s)\n' "$OUT" "$(du -h "$OUT" | cut -f1)"
printf '  Package %s · version %s · code %s\n' "$APP_ID" "$VERSION_NAME" "$VERSION_CODE"
printf '  Upload it in Play Console: Test and release > (Internal / Closed testing or Production) > Create new release.\n\n'
open -R "$OUT" 2>/dev/null || true
