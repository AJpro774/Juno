/**
 * OS/arch detect + placeholder links to GitHub Releases.
 * Asset name patterns match typical Tauri 2 / tauri-action output for productName "Juni IDE".
 * Until a release exists, all links fall back to /releases/latest.
 */

const REPO = "AJpro774/Juno";
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST = `${RELEASES}/latest`;
/** Site root (Netlify `/` and same-origin relative paths). */
const SITE_ROOT = new URL("../", import.meta.url);
const IDE_HREF = SITE_ROOT.href;
const SW_HREF = new URL("sw.js", SITE_ROOT).href;

/** @type {Record<string, { label: string; patterns: string[] }>} */
const ASSETS = {
  "macos-aarch64": {
    label: "macOS Apple Silicon (.dmg)",
    patterns: ["aarch64.dmg", "aarch64.app.tar.gz", "darwin-aarch64"],
  },
  "macos-x86_64": {
    label: "macOS Intel (.dmg)",
    patterns: ["x64.dmg", "x86_64.dmg", "darwin-x86_64", "x64.app.tar.gz"],
  },
  "windows-x86_64": {
    label: "Windows 10/11 x64 (NSIS / MSI)",
    patterns: ["x64-setup.exe", "x64_en-US.msi", "x64-setup", "windows-x86_64"],
  },
  "windows-aarch64": {
    label: "Windows 10/11 ARM64",
    patterns: ["arm64-setup.exe", "aarch64-setup.exe", "arm64_en-US.msi", "windows-aarch64"],
  },
  "linux-x86_64": {
    label: "Linux x86_64 (AppImage / deb)",
    patterns: ["amd64.AppImage", "amd64.deb", "x86_64.AppImage", "linux-x86_64"],
  },
  "linux-aarch64": {
    label: "Linux ARM64 (AppImage / deb)",
    patterns: ["aarch64.AppImage", "arm64.deb", "aarch64.deb", "linux-aarch64"],
  },
};

/**
 * @returns {{ os: 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown'; arch: 'aarch64' | 'x86_64' | 'unknown'; key: string | null }}
 */
function detectPlatform() {
  const ua = navigator.userAgent || "";
  const platform = (navigator.platform || "").toLowerCase();
  const uaData = navigator.userAgentData;

  let os = "unknown";
  if (/android/i.test(ua)) os = "android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "ios";
  else if (/mac/i.test(platform) || /Mac OS X/i.test(ua)) os = "macos";
  else if (/win/i.test(platform) || /Windows/i.test(ua)) os = "windows";
  else if (/linux/i.test(platform) || /Linux/i.test(ua)) os = "linux";

  let arch = "unknown";
  const brands = uaData?.architecture || "";
  if (typeof brands === "string" && brands) {
    if (/arm/i.test(brands)) arch = "aarch64";
    else if (/x86/i.test(brands)) arch = "x86_64";
  }
  if (arch === "unknown") {
    if (/aarch64|arm64|Apple Silicon/i.test(ua)) arch = "aarch64";
    else if (/x86_64|Win64|WOW64|amd64/i.test(ua)) arch = "x86_64";
    else if (os === "macos") {
      // Apple Silicon Macs still report Intel in many UAs; prefer aarch64 for recent Safari.
      arch = "aarch64";
    } else if (os === "windows" || os === "linux") {
      arch = "x86_64";
    }
  }

  let key = null;
  if (os === "macos" || os === "windows" || os === "linux") {
    key = `${os}-${arch}`;
    if (!ASSETS[key]) key = `${os}-x86_64`;
  }

  return { os, arch, key };
}

/**
 * Prefer a direct asset URL when the latest release lists a matching name; else latest page.
 * @param {string} assetKey
 * @param {Array<{ name: string; browser_download_url: string }> | null} assets
 */
function resolveAssetUrl(assetKey, assets) {
  const spec = ASSETS[assetKey];
  if (!spec || !assets?.length) return LATEST;
  const lower = assets.map((a) => ({ ...a, n: a.name.toLowerCase() }));
  for (const pat of spec.patterns) {
    const hit = lower.find((a) => a.n.includes(pat.toLowerCase()));
    if (hit) return hit.browser_download_url;
  }
  return LATEST;
}

async function fetchLatestAssets() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.assets) ? data.assets : [];
  } catch {
    return null;
  }
}

function highlightMatch(key) {
  document.querySelectorAll(".plat").forEach((el) => {
    const os = el.getAttribute("data-os");
    const arch = el.getAttribute("data-arch");
    el.classList.toggle("is-match", key === `${os}-${arch}`);
  });
}

async function main() {
  const { os, arch, key } = detectPlatform();
  const detectLine = document.getElementById("detect-line");
  const primary = document.getElementById("primary-download");
  const hint = document.getElementById("asset-hint");

  const label =
    os === "android"
      ? "Android detected — use Add to Home Screen below (PWA)."
      : os === "ios"
        ? "iOS detected — use Share → Add to Home Screen for the web IDE."
        : `Detected ${os} · ${arch}${key && ASSETS[key] ? ` → ${ASSETS[key].label}` : ""}.`;

  if (detectLine) detectLine.textContent = label;
  if (key) highlightMatch(key);

  const assets = await fetchLatestAssets();

  document.querySelectorAll("[data-asset]").forEach((a) => {
    const assetKey = a.getAttribute("data-asset");
    if (!assetKey) return;
    const url = resolveAssetUrl(assetKey, assets);
    a.setAttribute("href", url);
    if (!assets?.length || url === LATEST) {
      a.setAttribute("title", "Installers not published yet for this platform — opens GitHub Releases.");
    } else {
      a.removeAttribute("title");
    }
  });

  if (primary) {
    if (os === "android" || os === "ios") {
      primary.textContent = "Open web IDE";
      primary.setAttribute("href", IDE_HREF);
      if (hint) {
        hint.textContent =
          "Native desktop installers are for macOS / Windows 10–11 / Linux. Mobile uses the installable web app.";
      }
    } else if (key) {
      const url = resolveAssetUrl(key, assets);
      primary.setAttribute("href", url);
      primary.textContent = `Download ${ASSETS[key]?.label ?? "for your system"}`;
      if (hint) {
        if (!assets) {
          hint.textContent =
            "Could not reach GitHub Releases — browse the releases page, or try again later.";
        } else if (!assets.length || url === LATEST) {
          hint.textContent =
            "Installers not published yet for this platform — opening GitHub Releases until a v* build uploads assets.";
        } else {
          hint.textContent = "Linked to the matching asset on the latest GitHub Release.";
        }
      }
    } else if (hint) {
      hint.textContent =
        assets && assets.length === 0
          ? "Installers not published yet — check GitHub Releases after a v* desktop build."
          : "";
    }
  }

  // Optional Chromium beforeinstallprompt on this page
  let deferred = null;
  const installBtn = document.getElementById("install-pwa");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (installBtn) installBtn.hidden = false;
  });
  installBtn?.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
  });

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(SW_HREF, { scope: SITE_ROOT.pathname });
    } catch {
      /* ignore */
    }
  }
}

main();
