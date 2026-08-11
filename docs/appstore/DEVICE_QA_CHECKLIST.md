# Real-device / TestFlight QA checklist

Run this on a **physical iPhone** against a **pilot** build (`preview` or `production`
EAS profile) pointed at the real backend. Use **synthetic** accounts only (e.g. the
review-school seed, `supabase/production/review_seed.mjs`).

> Nothing here is auto-verified — a human must tap through it. Do **not** mark the
> release "device-validated" until every P0 row passes on a real device.

Legend: **P0** = must pass to submit · **P1** = should pass · pass/fail column for you.

## Authentication & onboarding
- **P0** Cold launch shows the **13+ age gate**; declining does not enter the app.
- **P0** Sign in with the seeded reviewer account → lands in the app.
- **P0** Wrong password shows a clear error, not a crash/spinner-forever.
- **P1** Redeem the invitation code on a fresh account → becomes verified.
- **P1** A pending/rejected/suspended account sees the correct status screen (not the feed).

## Navigation & layout
- **P0** All tabs load (Home/Campus Market, Marketplace, Wishlist/Community, Inbox, Profile).
- **P0** Back navigation works from every pushed screen (listing, thread, settings, account).
- **P0** Small screen (e.g. iPhone SE): no clipped text, no horizontal scroll, tappable targets.
- **P1** Large text / Dynamic Type at a bigger setting doesn't break core screens.
- **P1** Dark mode and light mode both render legibly.

## Marketplace & images
- **P0** Marketplace lists the seeded listings; opening one shows its detail.
- **P0** Create a listing; **pick a photo** from the library (permission prompt copy is accurate).
- **P0** The uploaded image renders (signed URL) on the listing after publish.
- **P0** Search / category filtering returns sensible results; empty search has an empty state.
- **P1** Save/unsave a listing persists after leaving and returning.

## Wishlist
- **P0** Create a wishlist item; it appears in "My Wishlist".
- **P1** A matching listing surfaces on the wishlist/discovery shelves.

## Messaging
- **P0** Start a conversation with the seller; send a message; it appears in the thread.
- **P0** Keyboard: the composer stays visible above the keyboard; send works; dismiss works.
- **P1** Re-open the thread later → history is intact.

## Offers & handoff
- **P0** Send an offer on a seller listing; it shows as pending in the thread.
- **P1** (With a second seeded account) accept → reserved → set a **safe handoff location** → complete.
- **P1** Borrow/lend shows the collection→return distinction.

## Reporting & blocking (UGC safety)
- **P0** Report a listing (••• → Report) with a reason; confirmation shown.
- **P0** Block a user; they disappear from new messages/offers; unblock in Settings restores.
- **P0** As the (seeded) moderator, open **Settings → Moderation queue**; see the report; remove/resolve it.

## Account & privacy
- **P0** Settings → Account & privacy → **Edit profile** saves.
- **P0** **Download my data** produces a JSON export share sheet.
- **P0** **Delete my account** → confirm → signed out; re-login reflects the request.

## Reliability, refresh & session
- **P0** Pull-to-refresh / re-focus updates lists without duplicate rows or crashes.
- **P0** Airplane mode: actions show a clear error/empty state, not an infinite spinner.
- **P0** Force-quit and relaunch → session is restored (still signed in, same school).
- **P1** Backgrounding during an upload/offer and returning leaves consistent state.

## Store-config sanity (once, on the build you'll submit)
- **P0** Build is **pilot** mode: no demo data, no "Exit demo"; a misconfigured build shows the "Backend not configured" screen (never mock data).
- **P0** `pnpm check:mobile-env` passed for this build's env.

---

When every **P0** passes on a real device, record the device model + iOS version + build
number here and treat device validation as complete.
