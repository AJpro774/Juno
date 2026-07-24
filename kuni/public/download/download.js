const RELEASES = "https://github.com/AJpro774/Juno/releases/latest";

function detect() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isAndroid = /Android/i.test(ua);
  const isMac = /Mac/i.test(platform) || /Mac OS X/i.test(ua);
  const isWin = /Win/i.test(platform) || /Windows/i.test(ua);
  const uaData = navigator.userAgentData;
  const isArm =
    /aarch64|arm64|Apple Silicon/i.test(ua) ||
    (uaData && uaData.architecture === "arm") ||
    (isMac && /Macintosh/.test(ua) && navigator.maxTouchPoints > 0);

  if (isAndroid) {
    return {
      os: "android",
      arch: "arm64",
      kind: "apk",
      label: "Android · APK",
      asset: "android-apk",
    };
  }
  if (isMac) {
    return {
      os: "macos",
      arch: isArm ? "aarch64" : "x86_64",
      kind: "dmg",
      label: isArm ? "macOS · Apple Silicon · DMG" : "macOS · Intel · DMG",
      asset: isArm ? "macos-aarch64-dmg" : "macos-x86_64-dmg",
    };
  }
  if (isWin) {
    return {
      os: "windows",
      arch: isArm ? "aarch64" : "x86_64",
      kind: "exe",
      label: isArm ? "Windows · ARM64 · EXE" : "Windows · x64 · EXE",
      asset: isArm ? "windows-aarch64-exe" : "windows-x86_64-exe",
    };
  }
  return {
    os: "web",
    arch: "any",
    kind: "pwa",
    label: "Web / PWA",
    asset: "",
  };
}

const d = detect();
const detectLine = document.getElementById("detect-line");
const primary = document.getElementById("primary-download");
const hint = document.getElementById("asset-hint");

if (detectLine) {
  detectLine.textContent =
    d.kind === "pwa"
      ? "Couldn't match a native installer — use the browser build or pick a platform below."
      : `Detected ${d.label}.`;
}

if (primary) {
  if (d.kind === "pwa") {
    primary.href = "../";
    primary.textContent = "Open Kuni in browser";
  } else {
    primary.href = RELEASES;
    primary.textContent = `Download ${d.kind.toUpperCase()}`;
  }
}

if (hint) {
  hint.textContent =
    d.kind === "apk"
      ? "APK builds need WebGPU-capable Chrome WebView. First launch downloads the ~6GB model."
      : d.kind === "pwa"
        ? "Install as a PWA from Chrome: menu → Install app."
        : "Release assets are published from the Kuni Tauri / Capacitor CI pipelines.";
}

for (const card of document.querySelectorAll(".plat")) {
  const os = card.getAttribute("data-os");
  const arch = card.getAttribute("data-arch");
  const kind = card.getAttribute("data-kind");
  if (os === d.os && (!arch || arch === d.arch) && (!kind || kind === d.kind)) {
    card.classList.add("is-recommended");
  }
}
