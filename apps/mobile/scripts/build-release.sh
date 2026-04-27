#!/usr/bin/env bash
# =============================================================================
# build-release.sh — Helper local pour builder une release iOS ou Android
# =============================================================================
# Usage :
#   ./scripts/build-release.sh ios            # genere .ipa via xcodebuild
#   ./scripts/build-release.sh android         # genere .aab via gradle
#   ./scripts/build-release.sh both            # les deux
#
# Prerequis :
#   - .env.local rempli (cf. .env.example)
#   - Pour iOS : machine macOS avec Xcode + CocoaPods
#   - Pour Android : JDK 17 + ANDROID_HOME defini
#
# Le but de ce script : reduire l'erreur humaine en pre-release. Il enchaine :
#   1. Verification env (.env.local present, vars critiques setees)
#   2. NODE_ENV=production + URL prod injectes pour cap sync
#   3. cap sync de la plateforme cible
#   4. Build natif via xcodebuild / gradle
#   5. Output dans build/ (ipa ou aab)
# =============================================================================

set -euo pipefail

PLATFORM="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(cd "$MOBILE_DIR/../.." && pwd)"

if [[ -z "$PLATFORM" ]]; then
  echo "Usage: $0 <ios|android|both>" >&2
  exit 1
fi

# Source .env.local si present (signing creds, FCM paths, etc.)
if [[ -f "$MOBILE_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$MOBILE_DIR/.env.local"
  set +a
fi

# Force la prod URL pour les builds release (override .env.local si necessaire)
export CAPACITOR_SERVER_URL="${CAPACITOR_SERVER_URL_PROD:-https://intranet.omnitech-security.fr}"
export NODE_ENV=production

echo "==> Mode : production"
echo "==> Server URL : $CAPACITOR_SERVER_URL"

build_ios() {
  if [[ "$(uname)" != "Darwin" ]]; then
    echo "[error] iOS builds nécessitent macOS." >&2
    exit 1
  fi

  : "${IOS_TEAM_ID:?IOS_TEAM_ID requis dans .env.local}"
  : "${IOS_BUNDLE_ID:?IOS_BUNDLE_ID requis dans .env.local}"

  echo "==> [iOS] cap sync ios"
  cd "$MOBILE_DIR"
  pnpm cap:sync:ios

  echo "==> [iOS] xcodebuild archive"
  cd "$MOBILE_DIR/ios/App"
  xcodebuild -workspace App.xcworkspace \
             -scheme App \
             -configuration Release \
             -archivePath "$MOBILE_DIR/build/ios/App.xcarchive" \
             -destination "generic/platform=iOS" \
             DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
             archive

  echo "==> [iOS] xcodebuild exportArchive"
  if [[ ! -f "$MOBILE_DIR/scripts/exportOptions.plist" ]]; then
    echo "[error] $MOBILE_DIR/scripts/exportOptions.plist manquant." >&2
    echo "        Copie scripts/exportOptions.example.plist et adapte." >&2
    exit 1
  fi

  xcodebuild -exportArchive \
             -archivePath "$MOBILE_DIR/build/ios/App.xcarchive" \
             -exportPath "$MOBILE_DIR/build/ios/ipa" \
             -exportOptionsPlist "$MOBILE_DIR/scripts/exportOptions.plist"

  echo "==> [iOS] OK : $MOBILE_DIR/build/ios/ipa/App.ipa"
}

build_android() {
  : "${ANDROID_KEYSTORE_PATH:?ANDROID_KEYSTORE_PATH requis dans .env.local}"
  : "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD requis}"
  : "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS requis}"
  : "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD requis}"

  echo "==> [Android] cap sync android"
  cd "$MOBILE_DIR"
  pnpm cap:sync:android

  echo "==> [Android] gradle bundleRelease"
  cd "$MOBILE_DIR/android"
  ./gradlew bundleRelease

  echo "==> [Android] OK : $MOBILE_DIR/android/app/build/outputs/bundle/release/app-release.aab"
}

case "$PLATFORM" in
  ios)
    build_ios
    ;;
  android)
    build_android
    ;;
  both)
    build_ios
    build_android
    ;;
  *)
    echo "Plateforme inconnue : $PLATFORM (attendu: ios|android|both)" >&2
    exit 1
    ;;
esac
