# Licensing

Juni / Juno uses the **Juni Software License and Commercial Contract 1.0** (a modified [PolyForm Small Business License 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0)) plus an EULA for distributed apps. Together they form a **binding contract** on download, install, use, or IDE acceptance.

| What | Terms |
|------|--------|
| **Source code** and official builds | [LICENSE](../../LICENSE) |
| **Distributed IDE / apps** | [EULA](../../EULA.md) **and** [LICENSE](../../LICENSE) |

### Free vs paid

| Who | Cost |
|-----|------|
| Personal / hobby | Free |
| Company under Small Business limits (&lt;100 workers, &lt;$1M USD 2019 CPI-adjusted prior-year revenue) | Free |
| Company above those limits | **USD $200 / month**, paid directly to Alexander James Patton (AJpro774) |

Arrange Commercial License payment via the contact method on the official repo/site. Use without payment when required is a material breach.

You may still ship **your** games and projects with the normal export runtime — see the Game and Project Export Exception in `LICENSE`.

### Provenance (automatic)

Juni permanently packs evidence into projects and builds:

- `juni.toml` `[juni]` + `JUNI.NOTICE` (injected on open/create)
- Export `NOTICE.txt`, HTML/JS comments, and `game.wasm.json` `juni` metadata
- Every compiled WASM includes a `juni.notice` custom section and `producers` (`processed-by: juni`)
- Runtime logs the Required Notice on instantiate

Do not strip these; LICENSE forbids removing Required Notice lines from exports/runtime.

In the IDE:

1. **First launch** — accept the EULA/contract (version bumps force re-accept).
2. **Settings → Legal** — full EULA and license text.
3. **Credits** — short summary.
