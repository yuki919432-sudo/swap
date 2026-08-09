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

## How to sign in (required — the app has no open sign-up)

Provide these in App Review Information:

- **Test email:** `<reviewer test account email>`
- **Test password:** `<password>`
- **Invitation code:** `<code from supabase/production/03_mint_invitation.sql>`

Reviewer steps:

1. Launch the app → confirm the **13+ age gate**.
2. Sign in with the test email/password above (already verified for the review
   school).
3. If prompted to enroll, enter the **invitation code** above → you land in the
   school as a verified student.
4. Browse the marketplace, open a listing, and try **Report** (••• menu) and
   **Block** — the UGC safety controls.
5. Open **Settings → Account & privacy** to see **Edit profile**, **Download my
   data**, and **Delete my account** (account deletion is initiated in-app).

> Provide a **second** test account (or note that the reviewer may create a listing)
> if the reviewer needs to see a two-student exchange. A moderator-enabled account can
> be provided on request to demonstrate the moderation queue.

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
