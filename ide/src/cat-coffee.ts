/** Playful Cat Coffee economy — Cat Coins from clean compiles. */

const STORAGE_KEY = "juni.cat.coffee";
const TIP_COST = 5;
const BADGE_COST = 25;

export type CatCoffeeState = {
  coins: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  tipsGiven: number;
  badgeUnlocked: boolean;
  lastMint: number;
};

type StoredShape = Partial<CatCoffeeState>;

function defaultState(): CatCoffeeState {
  return {
    coins: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    tipsGiven: 0,
    badgeUnlocked: false,
    lastMint: 0,
  };
}

function loadState(): CatCoffeeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as StoredShape;
    return {
      coins: Math.max(0, Number(parsed.coins) || 0),
      lifetimeEarned: Math.max(0, Number(parsed.lifetimeEarned) || 0),
      lifetimeSpent: Math.max(0, Number(parsed.lifetimeSpent) || 0),
      tipsGiven: Math.max(0, Number(parsed.tipsGiven) || 0),
      badgeUnlocked: !!parsed.badgeUnlocked,
      lastMint: Math.max(0, Number(parsed.lastMint) || 0),
    };
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

export function getCatCoffeeState(): CatCoffeeState {
  return { ...state };
}

/** Count non-blank lines in source (working-line heuristic for minting). */
export function countNonBlankLines(source: string): number {
  let n = 0;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().length > 0) n += 1;
  }
  return n;
}

/**
 * Mint Cat Coins after a successful Run/compile with 0 errors.
 * Award ≈ non-blank working lines (minimum 1 when source has content).
 */
export function mintCatCoinsForCleanRun(source: string): { minted: number; state: CatCoffeeState } {
  const lines = countNonBlankLines(source);
  const minted = lines > 0 ? lines : 0;
  if (minted <= 0) {
    return { minted: 0, state: getCatCoffeeState() };
  }
  state = {
    ...state,
    coins: state.coins + minted,
    lifetimeEarned: state.lifetimeEarned + minted,
    lastMint: minted,
  };
  persist();
  return { minted, state: getCatCoffeeState() };
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
  persist();
  return {
    ok: true,
    message: `Purr! Tip accepted (−${TIP_COST}). Tips given: ${state.tipsGiven}.`,
    state: getCatCoffeeState(),
  };
}

export function unlockCatBadge(): { ok: boolean; message: string; state: CatCoffeeState } {
  if (state.badgeUnlocked) {
    return { ok: true, message: "Badge already unlocked: Certified Cat Patron.", state: getCatCoffeeState() };
  }
  if (state.coins < BADGE_COST) {
    return {
      ok: false,
      message: `Need ${BADGE_COST} Cat Coins for the badge (you have ${state.coins}).`,
      state: getCatCoffeeState(),
    };
  }
  state = {
    ...state,
    coins: state.coins - BADGE_COST,
    lifetimeSpent: state.lifetimeSpent + BADGE_COST,
    badgeUnlocked: true,
  };
  persist();
  return {
    ok: true,
    message: "Unlocked: Certified Cat Patron",
    state: getCatCoffeeState(),
  };
}

export function tipCost(): number {
  return TIP_COST;
}

export function badgeCost(): number {
  return BADGE_COST;
}

function renderPanel(root: HTMLElement, flash?: string): void {
  const s = state;
  const badgeLabel = s.badgeUnlocked
    ? `<span class="cat-badge is-unlocked" title="Certified Cat Patron">Cat Patron</span>`
    : `<span class="cat-badge" title="Spend ${BADGE_COST} coins to unlock">Locked badge</span>`;
  const danceClass = s.lastMint > 0 ? "is-dancing" : "";
  root.innerHTML = `
    <h3 class="settings-heading">Buy My Cat a Coffee</h3>
    <p class="settings-blurb">
      Earn <strong>Cat Coins</strong> when Run/compile succeeds with zero errors — one coin per non-blank
      working line. Spend them to tip the cat or unlock a silly badge. Playful only — no real payments.
    </p>
    <div class="cat-coffee-stage">
      <img
        class="cat-dance ${danceClass}"
        src="/cat/dancing-cat.gif"
        alt="Dancing cat"
        width="96"
        height="96"
      />
      <div class="cat-coffee-stats" aria-live="polite">
        <div class="cat-stat"><span class="cat-stat-label">Cat Coins</span><span class="cat-stat-value" id="cat-coins">${s.coins}</span></div>
        <div class="cat-stat"><span class="cat-stat-label">Lifetime earned</span><span class="cat-stat-value">${s.lifetimeEarned}</span></div>
        <div class="cat-stat"><span class="cat-stat-label">Tips given</span><span class="cat-stat-value">${s.tipsGiven}</span></div>
        <div class="cat-stat cat-stat-badge">${badgeLabel}</div>
      </div>
    </div>
    ${flash ? `<p class="cat-flash" role="status">${flash}</p>` : ""}
    <div class="cat-coffee-actions">
      <button type="button" id="cat-tip" class="run tight">Tip the cat (−${TIP_COST})</button>
      <button type="button" id="cat-badge" class="ghost tight" ${s.badgeUnlocked ? "disabled" : ""}>
        ${s.badgeUnlocked ? "Badge unlocked" : `Unlock badge (−${BADGE_COST})`}
      </button>
    </div>
  `;
  root.querySelector("#cat-tip")?.addEventListener("click", () => {
    const result = tipTheCat();
    renderPanel(root, result.message);
  });
  root.querySelector("#cat-badge")?.addEventListener("click", () => {
    const result = unlockCatBadge();
    renderPanel(root, result.message);
  });
}

let panelBody: HTMLElement | null = null;

export function wireCatCoffeePanel(): void {
  panelBody = document.getElementById("cat-coffee-body");
  if (!panelBody) return;
  renderPanel(panelBody);
}

export function refreshCatCoffeePanel(flash?: string): void {
  if (!panelBody) {
    panelBody = document.getElementById("cat-coffee-body");
  }
  if (!panelBody) return;
  renderPanel(panelBody, flash);
}

/** Call after a clean compile; updates storage + panel UI. */
export function onCleanCompileSuccess(source: string): number {
  const { minted } = mintCatCoinsForCleanRun(source);
  if (minted > 0) {
    refreshCatCoffeePanel(`+${minted} Cat Coin${minted === 1 ? "" : "s"} from clean compile!`);
  }
  return minted;
}
