# App icons, splash & screenshots

What the store submission needs visually, and what's in the repo vs. owner-provided.

## App icon

- **Required:** a single **1024×1024 px** PNG, no alpha/transparency, no rounded
  corners (Apple applies the mask). Expo generates the smaller sizes from it.
- **Source in repo:** [`icon.svg`](../../apps/mobile/assets/icon.svg) — a simple,
  on-brand placeholder (the SWAP! swap-arrows mark on the brand background
  `#F7F8F5`). Export it to `apps/mobile/assets/icon.png` at 1024×1024 (any vector
  tool, or `rsvg-convert -w 1024 -h 1024 icon.svg > icon.png`) and reference it in
  `app.json` (`expo.icon`).
- **Final art is an owner/design task** — the placeholder is intentionally minimal so
  it is obviously not final.

## Splash / launch screen

- `app.json` already sets `splash.backgroundColor` to the brand ground `#F7F8F5`,
  `resizeMode: contain`. Add a centered logo asset (`expo.splash.image`) once final
  art exists; the plain background is acceptable for internal pilot builds.

## Screenshots (owner — needs a device/simulator)

Capture at the required sizes (at minimum 6.7" and 6.5" iPhone; iPad if you keep
`supportsTablet`). Suggested set, in order:

1. Welcome / 13+ age gate
2. Marketplace (finite shelves — no infinite feed)
3. Listing detail (with the Report/••• affordance visible)
4. Wishlist ("what students are looking for")
5. Settings → Account & privacy (edit / download / delete)

Keep them free of real student PII (use the review/test account's synthetic data).

## Checklist

- [ ] `icon.png` 1024×1024 exported and wired in `app.json`
- [ ] Final icon art (replaces placeholder)
- [ ] Splash logo asset (optional for pilot)
- [ ] 5 screenshots per required device size
