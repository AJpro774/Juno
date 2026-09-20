# Licensing

Juni / Juno uses the **Apache License 2.0** for source and builds, plus an EULA for distributed IDE/apps.

| What | Terms |
|------|--------|
| **Source code** and official builds | [LICENSE](../../LICENSE) (Apache-2.0) |
| **Distributed IDE / apps** | [EULA](../../EULA.md) **and** [LICENSE](../../LICENSE) |

### Free for everyone — no royalties

| Who | Cost |
|-----|------|
| Personal / hobby / education | Free |
| Indie and commercial companies of any size | Free |
| Shipping games / projects made with Juni | Free — **no royalties**, no revenue share |

You keep ownership of your content. You may ship your games with the normal export runtime; keep Required Notice / attribution lines where they appear (Apache NOTICE rules).

### Provenance (automatic)

Juni permanently packs evidence into projects and builds:

- `juni.toml` `[juni]` + `JUNI.NOTICE` (injected on open/create)
- Export `NOTICE.txt`, HTML/JS comments, and `game.wasm.json` `juni` metadata
- Every compiled WASM includes a `juni.notice` custom section and `producers` (`processed-by: juni`)
- Runtime logs the Required Notice on instantiate

Do not strip these; LICENSE requires retaining attribution notices.

In the IDE:

1. **First launch** — accept the EULA (version bumps force re-accept).
2. **Settings → Legal** — full EULA and license text.
3. **Credits** — short summary.
