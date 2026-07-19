/** Playful Cat Coffee — coins, shareable badges, local leaderboard. */

const STORAGE_KEY = "juni.cat.coffee";
const LEADERBOARD_KEY = "juni.cat.leaderboard";
const TIP_COST = 5;

export type BadgeId =
  | "patron"
  | "tipper"
  | "compiler"
  | "lines"
  | "themes"
  | "nightowl"
  | "flex";

export type CatCoffeeState = {
  coins: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  tipsGiven: number;
  nickname: string;
  badges: BadgeId[];
  /** @deprecated migrated into badges */
  badgeUnlocked?: boolean;
  lastMint: number;
  cleanRuns: number;
};

export type LeaderboardEntry = {
  nickname: string;
  score: number;
  badges: BadgeId[];
  updatedAt: number;
};

type StoredShape = Partial<CatCoffeeState>;

const BADGE_META: Record<
  BadgeId,
  { title: string; blurb: string; cost: number; color: string }
> = {
  patron: { title: "Cat Patron", blurb: "Bought the classic badge", cost: 25, color: "#0f6e56" },
  tipper: { title: "Tip Master", blurb: "Tip the cat 5 times", cost: 0, color: "#d4a017" },
  compiler: { title: "Clean Compiler", blurb: "10 clean Runs", cost: 0, color: "#2f6fed" },
  lines: { title: "Line Warrior", blurb: "Earn 500 lifetime coins", cost: 0, color: "#b42318" },
  themes: { title: "Theme Hopper", blurb: "Unlock by shopping themes vibe", cost: 40, color: "#7c3aed" },
  nightowl: { title: "Night Owl", blurb: "Spend 30 coins after dark vibes", cost: 30, color: "#1e293b" },
  flex: { title: "Flex Card", blurb: "The shareable flex badge", cost: 15, color: "#ea580c" },
};

function defaultState(): CatCoffeeState {
  return {
    coins: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    tipsGiven: 0,
    nickname: "",
    badges: [],
    lastMint: 0,
    cleanRuns: 0,
  };
}

function migrate(parsed: StoredShape): CatCoffeeState {
  const badges = new Set<BadgeId>(
    Array.isArray(parsed.badges)
      ? parsed.badges.filter((b): b is BadgeId => b in BADGE_META)
      : []
  );
  if (parsed.badgeUnlocked) badges.add("patron");
  return {
    coins: Math.max(0, Number(parsed.coins) || 0),
    lifetimeEarned: Math.max(0, Number(parsed.lifetimeEarned) || 0),
    lifetimeSpent: Math.max(0, Number(parsed.lifetimeSpent) || 0),
    tipsGiven: Math.max(0, Number(parsed.tipsGiven) || 0),
    nickname: typeof parsed.nickname === "string" ? parsed.nickname.slice(0, 24) : "",
    badges: [...badges],
    lastMint: Math.max(0, Number(parsed.lastMint) || 0),
    cleanRuns: Math.max(0, Number(parsed.cleanRuns) || 0),
  };
}

function loadState(): CatCoffeeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw) as StoredShape);
  } catch {
    return defaultState();
  }
}

let state = loadState();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function hasBadge(id: BadgeId): boolean {
  return state.badges.includes(id);
}

function grantBadge(id: BadgeId): void {
  if (hasBadge(id)) return;
  state = { ...state, badges: [...state.badges, id] };
}

function evaluateAutoBadges(): string[] {
  const unlocked: string[] = [];
  if (state.tipsGiven >= 5 && !hasBadge("tipper")) {
    grantBadge("tipper");
    unlocked.push(BADGE_META.tipper.title);
  }
  if (state.cleanRuns >= 10 && !hasBadge("compiler")) {
    grantBadge("compiler");
    unlocked.push(BADGE_META.compiler.title);
  }
  if (state.lifetimeEarned >= 500 && !hasBadge("lines")) {
    grantBadge("lines");
    unlocked.push(BADGE_META.lines.title);
  }
  return unlocked;
}

export function getCatCoffeeState(): CatCoffeeState {
  return { ...state, badges: [...state.badges] };
}

export function countNonBlankLines(source: string): number {
  let n = 0;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().length > 0) n += 1;
  }
  return n;
}

export function mintCatCoinsForCleanRun(source: string): {
  minted: number;
  unlocked: string[];
  state: CatCoffeeState;
} {
  const lines = countNonBlankLines(source);
  const minted = lines > 0 ? lines : 0;
  if (minted <= 0) {
    return { minted: 0, unlocked: [], state: getCatCoffeeState() };
  }
  state = {
    ...state,
    coins: state.coins + minted,
    lifetimeEarned: state.lifetimeEarned + minted,
    lastMint: minted,
    cleanRuns: state.cleanRuns + 1,
  };
  const unlocked = evaluateAutoBadges();
  persist();
  syncLeaderboardSelf();
  return { minted, unlocked, state: getCatCoffeeState() };
}

export function tipTheCat(): { ok: boolean; message: string; state: CatCoffeeState } {
  if (state.coins < TIP_COST) {
    return {
      ok: false,
      message: `Need ${TIP_COST} Cat Coins to tip (you have ${state.coins}).`,
      state: getCatCoffeeState(),
    };
  }
  state = {
    ...state,
    coins: state.coins - TIP_COST,
    lifetimeSpent: state.lifetimeSpent + TIP_COST,
    tipsGiven: state.tipsGiven + 1,
  };
  const auto = evaluateAutoBadges();
  persist();
  syncLeaderboardSelf();
  const extra = auto.length ? ` Unlocked: ${auto.join(", ")}.` : "";
  return {
    ok: true,
    message: `Purr! Tip accepted (−${TIP_COST}). Tips given: ${state.tipsGiven}.${extra}`,
    state: getCatCoffeeState(),
  };
}

export function unlockCatBadge(): { ok: boolean; message: string; state: CatCoffeeState } {
  return buyBadge("patron");
}

export function buyBadge(id: BadgeId): { ok: boolean; message: string; state: CatCoffeeState } {
  const meta = BADGE_META[id];
  if (!meta) return { ok: false, message: "Unknown badge.", state: getCatCoffeeState() };
  if (hasBadge(id)) {
    return { ok: true, message: `Already unlocked: ${meta.title}.`, state: getCatCoffeeState() };
  }
  if (meta.cost > 0 && state.coins < meta.cost) {
    return {
      ok: false,
      message: `Need ${meta.cost} Cat Coins for ${meta.title} (you have ${state.coins}).`,
      state: getCatCoffeeState(),
    };
  }
  if (meta.cost > 0) {
    state = {
      ...state,
      coins: state.coins - meta.cost,
      lifetimeSpent: state.lifetimeSpent + meta.cost,
    };
  }
  grantBadge(id);
  persist();
  syncLeaderboardSelf();
  return { ok: true, message: `Unlocked: ${meta.title}`, state: getCatCoffeeState() };
}

export function tipCost(): number {
  return TIP_COST;
}

export function badgeCost(): number {
  return BADGE_META.patron.cost;
}

export function listBadgeMeta(): typeof BADGE_META {
  return BADGE_META;
}

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e.nickname === "string" && typeof e.score === "number")
      .slice(0, 50);
  } catch {
    return [];
  }
}

function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function syncLeaderboardSelf(): void {
  const nick = state.nickname.trim() || "Anonymous";
  const entries = loadLeaderboard().filter((e) => e.nickname.toLowerCase() !== nick.toLowerCase());
  entries.push({
    nickname: nick,
    score: state.lifetimeEarned,
    badges: [...state.badges],
    updatedAt: Date.now(),
  });
  entries.sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  saveLeaderboard(entries);
}

export function getLeaderboard(): LeaderboardEntry[] {
  return loadLeaderboard().sort((a, b) => b.score - a.score).slice(0, 10);
}

export function setNickname(name: string): void {
  state = { ...state, nickname: name.trim().slice(0, 24) };
  persist();
  syncLeaderboardSelf();
}

/** SVG badge strip for flexing (download / copy). */
export function buildShareBadgeSvg(): string {
  const nick = escapeXml(state.nickname.trim() || "Juni Dev");
  const score = String(state.lifetimeEarned);
  const badges = state.badges.length
    ? state.badges.map((id) => BADGE_META[id].title).join(" · ")
    : "no badges yet";
  const w = 520;
  const h = 120;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f6e56"/>
      <stop offset="100%" stop-color="#1c1915"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="16" fill="url(#g)"/>
  <text x="24" y="42" fill="#f7fff9" font-family="system-ui,sans-serif" font-size="22" font-weight="700">Juni Cat Coffee</text>
  <text x="24" y="72" fill="#d9efe6" font-family="system-ui,sans-serif" font-size="16">${nick} · ${score} lifetime coins</text>
  <text x="24" y="98" fill="#a7c4b8" font-family="system-ui,sans-serif" font-size="13">${escapeXml(badges)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function copyShareBadge(): Promise<{ ok: boolean; message: string }> {
  const svg = buildShareBadgeSvg();
  const md = `![Juni Cat Coffee badge](data:image/svg+xml;utf8,${encodeURIComponent(svg)})`;
  try {
    await navigator.clipboard.writeText(md);
    return { ok: true, message: "Copied markdown badge to clipboard — paste anywhere to flex." };
  } catch {
    return { ok: false, message: "Clipboard blocked — use Download badge instead." };
  }
}

export function downloadShareBadge(): void {
  const svg = buildShareBadgeSvg();
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `juni-cat-coffee-${(state.nickname || "badge").replace(/\W+/g, "-")}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderPanel(root: HTMLElement, flash?: string): void {
  const s = state;
  const danceClass = s.lastMint > 0 ? "is-dancing" : "";
  const badgeChips = (Object.keys(BADGE_META) as BadgeId[])
    .map((id) => {
      const meta = BADGE_META[id];
      const on = hasBadge(id);
      return `<span class="cat-badge ${on ? "is-unlocked" : ""}" title="${meta.blurb}" style="${on ? `border-color:${meta.color}` : ""}">${meta.title}${on ? "" : " ✕"}</span>`;
    })
    .join("");

  const shop = (Object.keys(BADGE_META) as BadgeId[])
    .filter((id) => BADGE_META[id].cost > 0 && !hasBadge(id))
    .map(
      (id) =>
        `<button type="button" class="ghost tight cat-buy-badge" data-badge="${id}">Buy ${BADGE_META[id].title} (−${BADGE_META[id].cost})</button>`
    )
    .join("");

  const board = getLeaderboard()
    .map(
      (e, i) =>
        `<li><span class="lb-rank">#${i + 1}</span> <strong>${escapeHtml(e.nickname)}</strong> — ${e.score} · ${e.badges.length} badge${e.badges.length === 1 ? "" : "s"}</li>`
    )
    .join("");

  root.innerHTML = `
    <h3 class="settings-heading">Buy My Cat a Coffee</h3>
    <p class="settings-blurb">
      Earn <strong>Cat Coins</strong> on clean Run (1 per non-blank line). Unlock badges, share a flex card, climb the local leaderboard.
    </p>
    <label class="settings-field">
      Nickname (leaderboard)
      <input type="text" id="cat-nick" maxlength="24" value="${escapeAttr(s.nickname)}" placeholder="Anonymous" />
    </label>
    <div class="cat-coffee-stage">
      <img class="cat-dance ${danceClass}" src="/cat/dancing-cat.gif" alt="Dancing cat" width="96" height="96" />
      <div class="cat-coffee-stats" aria-live="polite">
        <div class="cat-stat"><span class="cat-stat-label">Cat Coins</span><span class="cat-stat-value" id="cat-coins">${s.coins}</span></div>
        <div class="cat-stat"><span class="cat-stat-label">Lifetime earned</span><span class="cat-stat-value">${s.lifetimeEarned}</span></div>
        <div class="cat-stat"><span class="cat-stat-label">Tips given</span><span class="cat-stat-value">${s.tipsGiven}</span></div>
        <div class="cat-stat"><span class="cat-stat-label">Clean runs</span><span class="cat-stat-value">${s.cleanRuns}</span></div>
      </div>
    </div>
    <div class="cat-badge-row">${badgeChips}</div>
    ${flash ? `<p class="cat-flash" role="status">${flash}</p>` : ""}
    <div class="cat-coffee-actions">
      <button type="button" id="cat-tip" class="run tight">Tip the cat (−${TIP_COST})</button>
      ${shop}
    </div>
    <div class="cat-coffee-actions">
      <button type="button" id="cat-share" class="ghost tight">Copy share badge</button>
      <button type="button" id="cat-download" class="ghost tight">Download badge SVG</button>
    </div>
    <h3 class="settings-heading">Leaderboard</h3>
    <p class="settings-blurb">Local to this browser — set a nickname and earn coins to place. Share your badge SVG to flex elsewhere.</p>
    <ol class="cat-leaderboard">${board || "<li class='muted'>No scores yet — Run clean code!</li>"}</ol>
  `;

  root.querySelector("#cat-nick")?.addEventListener("change", (ev) => {
    const v = (ev.target as HTMLInputElement).value;
    setNickname(v);
    renderPanel(root, "Nickname saved.");
  });
  root.querySelector("#cat-tip")?.addEventListener("click", () => {
    const result = tipTheCat();
    renderPanel(root, result.message);
  });
  root.querySelectorAll(".cat-buy-badge").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.badge as BadgeId;
      const result = buyBadge(id);
      renderPanel(root, result.message);
    });
  });
  root.querySelector("#cat-share")?.addEventListener("click", () => {
    void copyShareBadge().then((r) => renderPanel(root, r.message));
  });
  root.querySelector("#cat-download")?.addEventListener("click", () => {
    downloadShareBadge();
    renderPanel(root, "Badge SVG downloaded.");
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

let panelBody: HTMLElement | null = null;

export function wireCatCoffeePanel(): void {
  panelBody = document.getElementById("cat-coffee-body");
  if (!panelBody) return;
  renderPanel(panelBody);
}

export function refreshCatCoffeePanel(flash?: string): void {
  if (!panelBody) panelBody = document.getElementById("cat-coffee-body");
  if (!panelBody) return;
  renderPanel(panelBody, flash);
}

export function onCleanCompileSuccess(source: string): number {
  const { minted, unlocked } = mintCatCoinsForCleanRun(source);
  if (minted > 0) {
    const badgeNote = unlocked.length ? ` Badges: ${unlocked.join(", ")}.` : "";
    refreshCatCoffeePanel(
      `+${minted} Cat Coin${minted === 1 ? "" : "s"} from clean compile!${badgeNote}`
    );
  }
  return minted;
}
