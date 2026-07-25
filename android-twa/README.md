# Juni Android APK (Trusted Web Activity)

Wraps the live PWA at [https://junoengine.netlify.app](https://junoengine.netlify.app) in a sideloadable APK via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

## CI

Workflow: [`.github/workflows/release-android.yml`](../.github/workflows/release-android.yml)

- Runs on `v*` tags (with desktop release) and **workflow_dispatch**
- Uploads `Juni-IDE-android.apk` to the GitHub Release
- Optional secrets for a **stable** signing key (recommended once you ship):

| Secret | Purpose |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.keystore` / `.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password |
| `ANDROID_KEY_ALIAS` | Key alias (default `juni`) |

If secrets are missing, CI generates an ephemeral keystore for that run (fine for testing; Digital Asset Links fingerprint will change each time).

## Local build

```bash
# JDK 17 + Android SDK with build-tools / platform android-34
npm install -g @bubblewrap/cli
bubblewrap updateConfig --jdkPath "$JAVA_HOME" --androidSdkPath "$ANDROID_HOME"

cd android-twa
# first time only — generates the Android Gradle project next to twa-manifest.json
yes '' | bubblewrap init --manifest=https://junoengine.netlify.app/manifest.webmanifest \
  --directory=. 2>/dev/null || true
# if init already ran / twa-manifest exists:
bubblewrap update --skipVersionUpgrade

export BUBBLEWRAP_KEYSTORE_PASSWORD=… BUBBLEWRAP_KEY_PASSWORD=…
bubblewrap build --skipPwaValidation
# → app-release-signed.apk
```

## Digital Asset Links

For a full-screen TWA (no Chrome URL bar), publish
[`ide/public/.well-known/assetlinks.json`](../ide/public/.well-known/assetlinks.json)
with the SHA-256 of your **release** signing cert, then redeploy Netlify.

```bash
keytool -list -v -keystore android.keystore -alias juni
# copy SHA256 → assetlinks.json "sha256_cert_fingerprints"
```

Or after a CI build:

```bash
bubblewrap fingerprint generateAssetLinks --output=../ide/public/.well-known/assetlinks.json
```

## Package id

`dev.juni.ide` — keep in sync with download hub / assetlinks.
