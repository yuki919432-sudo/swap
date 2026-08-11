# App Review notes & reviewer access

Paste the relevant parts into **App Store Connect → App Review Information → Notes**,
and provide the demo account there. This app is **invitation-only and school-scoped**,
so a reviewer cannot self-enroll — they need a working test account **and** an
invitation code, supplied below.

## What SWAP! is (one paragraph for the reviewer)

SWAP! is a private, invitation-only marketplace and community utility for verified
students at a single participating school. Students give, swap, borrow, and lend
items with classmates and hand off in person at safe on-campus locations. **There are
no payments and no advertising.** Access requires a school invitation code; all data
is isolated per school. Minimum age is 13.

## Reviewer independence (no real people or roster needed)

Before review, the operator runs **`supabase/production/review_seed.mjs`** once. It
stands up an isolated, fully **synthetic review school** with sample listings and two
synthetic accounts. As a result the reviewer needs **no** real student, **no** real
school employee, **no** roster, and **no** manual intervention during review — the
provided login is pre-verified and is also a moderator, so one account demonstrates
the entire app end to end.

## How to sign in (the app has no open sign-up — this is expected)

Provide these in App Review Information (from the seed script's output):

- **Test email:** `appreview@swap-review.test` (pre-verified; also a moderator)
- **Test password:** `<REVIEW_PASSWORD used when seeding>`
- **Invitation code (optional, to demo enrollment):** `SWAP-REVIEW-2026`

## Feature walkthrough (everything is reachable from this one account)

1. **Age gate** — launch → confirm you are 13+.
2. **Sign in** with the test email/password above → you land verified in the review
   school (no enrollment step needed). *To also see enrollment,* sign out and sign up
   a fresh account, then enter the invitation code above.
3. **Campus Market / discovery** — the home surface shows finite shelves of the seeded
   listings (no infinite feed).
4. **Listings** — open any sample listing; **create your own** listing (attach a photo
   to see image upload).
5. **Wishlist** — add a "looking for" item; see it on your wishlist.
6. **Messaging** — open a seeded listing → message the seller (`seller@swap-review.test`).
7. **Offers / handoff** — on a seeded listing, **make an offer**; the offer appears in
   the thread. (Full bilateral accept→handoff→complete needs the second account; the
   offer/handoff UI is fully visible from the reviewer account.)
8. **Reporting** — ••• → **Report** on a listing/message with a reason.
9. **Moderation** — because this account is a moderator, open **Settings → Moderation
   queue** to see the report you filed and **remove/resolve** it.
10. **Blocking** — block the seller from a thread; manage/unblock in **Settings**.
11. **Account deletion** — **Settings → Account & privacy → Delete my account**
    (also **Edit profile** and **Download my data** there).

## Guideline-specific pointers for the reviewer

- **1.2 User-generated content**: content is filtered on submit; every listing,
  message, user, and image can be **reported**; users can be **blocked**; reports go
  to human moderators who can remove content and suspend members (Settings →
  Moderation queue on a moderator account). The EULA has a **zero-tolerance** clause
  for objectionable content and abusive users.
- **5.1.1(v) Account deletion**: fully in-app at Settings → Account & privacy →
  **Delete my account**.
- **5.1.4 / minors**: 13+ only; no under-13 accounts; no behavioral ads; no precise
  location; school email used only for verification and never shown publicly.
- **3.1.1 Payments**: none — the app facilitates free give/swap/borrow/lend only and
  takes no payments, so no In-App Purchase is required.

## Notes on network / demo mode

Release builds run in **pilot** mode against the production backend — there is no
mock/demo data path in the shipped build. The reviewer account is a normal verified
student in the review school; nothing special is required beyond the credentials
above.
