# Capacitor — Runbook Build iOS + Android

> Audience : devs / DevOps / release manager
> Prerequis : `pnpm install` deja execute a la racine du monorepo

## 1. Sommaire

1. [Prerequis machine](#2-prerequis-machine)
2. [Synchronisation des plateformes](#3-synchronisation-des-plateformes-cap-sync)
3. [Build iOS (debug + release)](#4-build-ios)
4. [Build Android (debug + release)](#5-build-android)
5. [Distribution (TestFlight / Play Internal)](#6-distribution)
6. [Generation icons + splash](#7-generation-icons-et-splash)
7. [Troubleshooting](#8-troubleshooting)

## 2. Prerequis machine

### iOS (build local possible **uniquement sur macOS**)

- macOS 14.0+ (Sonoma ou superieur)
- Xcode 16.0+ (`xcode-select --install` puis depuis l'App Store)
- CocoaPods 1.15+ (`sudo gem install cocoapods` ou `brew install cocoapods`)
- Compte Apple Developer (Enterprise ou Individual) avec :
  - Team ID (`IOS_TEAM_ID` dans `.env.local`)
  - Bundle ID enregistre : `fr.omnitechsecurity.intranet`
  - APNs key (.p8) genere depuis [Apple Developer Portal -> Keys](https://developer.apple.com/account/resources/authkeys/list) avec scope APNs
  - Provisioning profile (App Store ou AdHoc selon le canal)

### Android (build local possible sur Linux / macOS / Windows)

- JDK 17 LTS (`brew install openjdk@17` ou `apt install openjdk-17-jdk`)
- Android Studio Hedgehog (2023.1.1) ou plus recent — pour le SDK et l'emulateur
- Android SDK Platform 34 + Build Tools 34 (auto-installe via Studio)
- Variable d'env `ANDROID_HOME` pointant vers le SDK
- Pour push FCM : projet Firebase + `google-services.json` place dans `apps/mobile/android/app/`

### Cles signing (release builds uniquement)

- iOS : provisioning profile + certificat .p12 (depuis Apple Developer)
- Android : keystore .jks (genere via `keytool` une fois pour toutes, conserve dans le coffre prod)

## 3. Synchronisation des plateformes (`cap sync`)

Apres tout changement dans :

- `apps/mobile/capacitor.config.ts`
- Liste des plugins dans `apps/mobile/package.json`
- Web assets de fallback (`apps/frontend/public/`)

executer :

```bash
# Tout sync (iOS + Android)
pnpm --filter @omnitech/mobile cap:sync

# Sync seulement une plateforme
pnpm --filter @omnitech/mobile cap:sync:ios
pnpm --filter @omnitech/mobile cap:sync:android
```

`cap sync` :

1. Copie le contenu de `webDir` (`apps/frontend/public/`) dans le bundle natif
2. Met a jour `capacitor.config.json` natif a partir du `.ts`
3. Reinstalle les plugins natifs (Pods sur iOS, Gradle deps sur Android)
4. Re-genere les fichiers `capacitor.plugins.json` qui listent les plugins actifs

## 4. Build iOS

### 4.1 Debug local (sur simulateur)

```bash
# 1. Sync
cd apps/mobile
pnpm cap:sync:ios

# 2. Ouvrir Xcode
pnpm cap:open:ios
# (= npx cap open ios — equivalent a `open ios/App/App.xcworkspace`)

# 3. Dans Xcode :
#    - Select target "App" -> scheme "App"
#    - Choisir un simulator (iPhone 15 Pro recommande, iOS 17.x)
#    - Cmd+R pour build & run
```

### 4.2 Build sur device physique (debug)

Prerequis : device branche en USB + Apple Developer account configure dans Xcode (Settings -> Accounts).

```bash
# 1. Override l'URL pour pointer vers ton dev server local
#    (le device n'a pas acces a localhost — utilise l'IP LAN de ta machine)
echo 'CAPACITOR_SERVER_URL=http://192.168.1.42:3001' > apps/mobile/.env.local

# 2. Lance le frontend dev
pnpm --filter @omnitech/frontend dev

# 3. Sync + ouvre Xcode
cd apps/mobile
pnpm cap:sync:ios
pnpm cap:open:ios

# 4. Xcode :
#    - Select team (Signing & Capabilities tab)
#    - Connect device, select it dans le scheme
#    - Cmd+R
```

### 4.3 Build release (.ipa pour distribution)

```bash
cd apps/mobile

# 1. Sync en mode prod
NODE_ENV=production CAPACITOR_SERVER_URL=https://intranet.omnitech-security.fr pnpm cap:sync:ios

# 2. Archive depuis Xcode (UI) :
#    Product -> Archive (necessite scheme "App" en mode Release)
#    -> Organizer s'ouvre -> Distribute App
#    -> Choix : App Store Connect / AdHoc / Enterprise / Development
#    -> Sign avec le certificat correspondant
#    -> Export .ipa

# 3. Alternative CLI (xcodebuild) :
xcodebuild -workspace ios/App/App.xcworkspace \
           -scheme App \
           -configuration Release \
           -archivePath ./build/App.xcarchive \
           archive

xcodebuild -exportArchive \
           -archivePath ./build/App.xcarchive \
           -exportPath ./build/ipa \
           -exportOptionsPlist ./ios/exportOptions.plist
```

> Note : `exportOptions.plist` a creer la premiere fois, contient methode (app-store / ad-hoc / enterprise) + teamID + provisioning profile name. Template Apple : [exportOptions.plist reference](https://help.apple.com/xcode/mac/current/#/dev7ccaf4d3c).

## 5. Build Android

### 5.1 Debug local (sur emulateur ou device)

```bash
cd apps/mobile

# 1. Sync
pnpm cap:sync:android

# 2. Lancer Android Studio (necessaire pour SDK + emulateur)
pnpm cap:open:android
# (= npx cap open android — equivalent a `studio android/`)

# 3. Dans Android Studio :
#    - Attendre la fin du Gradle sync
#    - Run 'app' (Shift+F10 ou la fleche verte)
```

### 5.2 Build .apk debug en CLI

```bash
cd apps/mobile/android
./gradlew assembleDebug

# Output : android/app/build/outputs/apk/debug/app-debug.apk
```

Installer sur device USB :

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 5.3 Build release (.aab pour Play Store)

```bash
cd apps/mobile

# 1. Sync en mode prod
NODE_ENV=production CAPACITOR_SERVER_URL=https://intranet.omnitech-security.fr pnpm cap:sync:android

# 2. Configure le keystore (une fois)
#    Genere si pas deja fait :
#    keytool -genkey -v -keystore omnitech-intranet.jks \
#            -keyalg RSA -keysize 2048 -validity 10000 \
#            -alias omnitech-intranet
#
#    Puis place ANDROID_KEYSTORE_PATH dans .env.local + ajoute dans
#    android/app/build.gradle :
#
#    signingConfigs {
#        release {
#            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
#            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
#            keyAlias System.getenv("ANDROID_KEY_ALIAS")
#            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
#        }
#    }
#    buildTypes {
#        release {
#            signingConfig signingConfigs.release
#            minifyEnabled true
#            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
#        }
#    }

# 3. Build le bundle .aab
cd android
./gradlew bundleRelease

# Output : android/app/build/outputs/bundle/release/app-release.aab
```

## 6. Distribution

### 6.1 iOS — TestFlight (beta interne)

1. Build release (`.ipa`) avec methode `app-store`
2. Upload via Xcode Organizer ou `xcrun altool` ou Transporter app
3. Console [App Store Connect](https://appstoreconnect.apple.com) -> TestFlight -> Distribuer aux testeurs internes
4. Reviewers internes recoivent un mail + invite

### 6.2 iOS — App Store / Enterprise

> ATTENTION review 4.2 — voir `docs/mobile/ARCHITECTURE.md` §7. Distribuer en **Apple Business Manager Custom Apps** ou **Enterprise** evite la review publique.

### 6.3 Android — Play Internal Testing

1. Build release (`.aab`)
2. Upload sur [Play Console](https://play.google.com/console) -> Test interne -> Creer un release
3. Review automatique 24-48h, puis disponible aux testeurs (max 100)

### 6.4 Android — Production

1. Promote depuis Internal Testing -> Closed Testing -> Production
2. Premier soumission requiert listing complet (description, screenshots, privacy policy URL, content rating)

## 7. Generation icons et splash

Les assets sources (PNG haute resolution) vivent dans `apps/frontend/public/icon-512.png`. Capacitor genere automatiquement toutes les tailles iOS + Android via `@capacitor/assets`.

```bash
# Une fois pour toutes (apres avoir mis a jour icon-512.png)
cd apps/mobile
pnpm icons:generate

# Equivalent a :
# capacitor-assets generate \
#   --assetPath ../frontend/public \
#   --iconBackgroundColor '#004469' \
#   --splashBackgroundColor '#F5F5F5'
```

L'outil cherche par defaut :

- `../frontend/public/icon.png` (1024x1024 minimum) -> AppIcon.appiconset (iOS) + mipmap-\* (Android)
- `../frontend/public/splash.png` (2732x2732 carre, contenu centre dans 1200x1200) -> Splash.imageset (iOS) + drawable-\* (Android)

> TODO operationnel : creer `apps/frontend/public/splash.png` (variante du logo OMNITECH centre sur fond bleu SEAL `#004469`). Pour l'instant le splash auto-genere est neutre.

## 8. Troubleshooting

### `cap sync` echoue avec "Capacitor CLI requires NodeJS >= 22"

Verifier la version de Capacitor installee. On utilise `7.6.2` (compat Node 20). Si quelqu'un a force-bump vers 8.x, revertir dans `apps/mobile/package.json`.

### iOS : "Code signing error: No profiles for 'fr.omnitechsecurity.intranet' were found"

1. Apple Developer Portal -> Identifiers -> Verifier que le bundle ID existe
2. Profiles -> Generer un Development ou App Store profile
3. Xcode -> Signing & Capabilities -> Refresh

### Android : "SDK location not found"

```bash
# Definir ANDROID_HOME (path standard sur macOS / Linux)
export ANDROID_HOME=$HOME/Library/Android/sdk     # macOS
export ANDROID_HOME=$HOME/Android/Sdk             # Linux
# Puis ajouter dans ~/.zshrc / ~/.bashrc
```

### Android : "Could not find google-services.json"

Si tu n'utilises PAS encore FCM (push natifs) :

- Retirer le plugin `com.google.gms.google-services` de `android/app/build.gradle`

Si tu uses FCM :

- Telecharger `google-services.json` depuis Firebase Console -> Project Settings -> Your apps -> Android
- Place dans `apps/mobile/android/app/google-services.json` (gitignored)

### WebView affiche page blanche

1. Verifier que `CAPACITOR_SERVER_URL` est correct (HTTPS ou IP joignable)
2. Sur iOS sim, verifier que la machine peut atteindre l'URL (`curl https://intranet.omnitech-security.fr` depuis ton terminal)
3. Activer le debug WebView :
   - iOS : Safari -> Develop -> [Simulator] -> ton app
   - Android : `chrome://inspect` (uniquement si `webContentsDebuggingEnabled: true` en config, automatique en dev)
4. Verifier la console pour les erreurs CORS / CSP

### Push notifications ne fonctionnent pas (iOS)

1. Verifier que `Push Notifications` capability est cochee dans Xcode -> Signing & Capabilities
2. Verifier que le APNs key (.p8) est uploade cote backend (NestJS push-notifications module)
3. Test sur **device physique** (les push ne fonctionnent pas sur simulateur < iOS 16.4)
4. Verifier que l'app a demande la permission utilisateur (`pn.requestPermissions()`)

### Build Gradle Java version mismatch

Capacitor 7 demande JDK 17. Si `JAVA_HOME` pointe vers JDK 11 ou 21, le build echoue avec des erreurs cryptiques. Verifier :

```bash
java -version
# openjdk version "17.x.x" attendu
```

## 9. Checklist pre-release

- [ ] `CAPACITOR_SERVER_URL` pointe vers la prod URL
- [ ] `NODE_ENV=production` au moment du sync (desactive WebView debug Android)
- [ ] Version bumped dans `apps/mobile/package.json` ET dans :
  - iOS : `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`)
  - Android : `android/app/build.gradle` (`versionName`, `versionCode`)
- [ ] CHANGELOG.md mis a jour
- [ ] Icons / splash regeneres si modifies
- [ ] Build sur device physique teste (login + nav + une push notif test)
- [ ] Privacy policy URL renseignee (App Store / Play Store)
- [ ] Screenshots stores a jour (en cas de changement UI Next.js majeur)
