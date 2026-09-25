#!/usr/bin/env bash
#
# Builds the Android debug APK for Enterprise Resource Planning.
#
#   cd "~/Desktop/Sompriti Enterprice Project/sompriti-erp"
#   ./build-apk.sh
#
# Needs: Node 22.22.3+ or 24+, a JDK 21, and the Android SDK (installed by Android Studio).
# The first run takes about ten minutes while Gradle downloads the Android toolchain;
# later runs take under a minute.

set -euo pipefail

cd "$(dirname "$0")/frontend"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mx %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- prerequisites
command -v node >/dev/null || fail "Node is not installed. Try: nvm use 24"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $(node -v) is too old for Angular. Try: nvm use 24"

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[ -d "$SDK_DIR" ] || fail "Android SDK not found at $SDK_DIR.
   Open Android Studio once and let it finish its first-run setup, or set ANDROID_HOME."

# Capacitor 8's Android libraries request a Java 21 toolchain, so any other JDK on the
# PATH is not enough - Gradle fails with "Cannot find a Java installation ... languageVersion=21".
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
   Installed JDKs:
$(/usr/libexec/java_home -V 2>&1 | sed 's/^/     /')
   Fix with either:
     brew install --cask temurin@21
     or open Android Studio once so its bundled JDK 21 is available."

export JAVA_HOME="$JDK21"
export PATH="$JAVA_HOME/bin:$PATH"

step "Node $(node -v) · JDK 21 at $JAVA_HOME · SDK at $SDK_DIR"

# ---------------------------------------------------------------- build the web app
step "Installing dependencies"
npm install --no-audit --no-fund

step "Building the Angular app for mobile"
npm run build:mobile
printf '    API it will call: '
grep -o "apiBaseUrl: '[^']*'" src/environments/environment.mobile.ts | cut -d"'" -f2

# ---------------------------------------------------------------- native project
if [ ! -d android ]; then
  step "Creating the Android project (one time)"
  npx cap add android
  step "Generating launcher icons and the splash screen"
  npx @capacitor/assets generate --android || echo "    (skipped - icons can be generated later)"
fi

echo "sdk.dir=$SDK_DIR" > android/local.properties

step "Syncing the web build into the Android project"
npx cap sync android

# ---------------------------------------------------------------- APK
step "Building the APK (first run downloads the Android toolchain)"
cd android
# Point Gradle's toolchain detection at the JDK 21 we found, not just at JAVA_HOME.
./gradlew -Dorg.gradle.java.installations.paths="$JAVA_HOME" assembleDebug

APK="$PWD/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || fail "Gradle finished but the APK is missing."

printf '\n\033[1;32m✓ APK ready\033[0m\n  %s\n  %s\n\n' \
  "$APK" "$(du -h "$APK" | cut -f1) - AirDrop it to your phone and tap to install."
open -R "$APK" 2>/dev/null || true
