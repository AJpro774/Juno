# Appearance themes & Cat Coffee

The Juni IDE ships a small set of **appearance themes** and a playful **Cat Coffee** side panel (v9.0).

## Appearance

Open **Settings** → **UI appearance**. Themes:

| Id | Feel |
|----|------|
| Classic | Warm parchment (default) |
| Modern | Cool dark chrome + rearranged workspace |
| Cosmic | Deep space with soft teal/blue nebula accents |
| Froggy | Leafy greens / pond |
| Berryland | Berry jam pinks, kept readable |
| Basic | High-contrast neutral |
| Hacker | Terminal green on near-black |

Unknown or legacy values migrate to **Classic**. Preference is stored in `localStorage` (`juni.ui.appearance`).

## Cat Coffee

Toolbar **Cat Coffee** opens a panel like Settings:

- **Cat Coins** mint when **Run** / compile succeeds with **0 errors**
- Award ≈ **non-blank lines** in the active working file
- Coins and lifetime stats persist in `localStorage` (`juni.cat.coffee`)
- A dancing cat GIF celebrates clean compiles
- Spend playfully: **Tip the cat** or unlock the **Cat Patron** badge

This is in-app fun only — no real payments or tip rails in v9.
