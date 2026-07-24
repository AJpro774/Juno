# Kuni Android (APK)

Capacitor wraps the Vite web build into an Android project that produces an `.apk`.

## One-time setup

```bash
cd kuni
npm install
npm run build
npx cap add android
```

This creates `android/` (replacing the placeholder). Then:

```bash
npm run android:sync
npm run android:open
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Notes

- KunoEngine needs a **WebGPU**-capable WebView (Chrome-based). Older Android WebViews will show “No WebGPU”.
- First launch still downloads the ~6GB model weights into browser storage inside the WebView.
- Publish the APK to GitHub Releases and the [download page](../public/download/) will link to it.
