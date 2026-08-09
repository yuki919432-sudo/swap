# Privacy nutrition labels & PII inventory

The data SWAP! collects, mapped to Apple's **App Privacy** questionnaire (App Store
Connect → App Privacy) and Google Play's Data safety form. This is the authoritative
inventory for filling those forms accurately.

Guiding facts about SWAP!:

- **No advertising, no data brokering, no third-party analytics/tracking SDKs.**
- **No payments** (no financial data collected).
- **No precise or coarse location** collected.
- **Minimum age 13**; no accounts for under-13s; no date of birth stored (a local
  13+ attestation only).
- School email is used **only** to verify membership and is **never shown publicly**.

## Summary answers (App Store Connect)

| Question | Answer |
|----------|--------|
| Do you or your third-party partners collect data from this app? | **Yes** (the categories below) |
| Is data used to track users (across apps/websites owned by other companies)? | **No** |
| Is any collected data used for third-party advertising / your advertising / marketing? | **No** |

Every item below is **linked to the user's identity** (it lives in their account) and
is collected for **App Functionality** and/or **Security/Anti-fraud** — never for
tracking or advertising.

## Data types collected

| Apple data type | What, specifically | Purpose | Linked | Tracking |
|-----------------|--------------------|---------|--------|----------|
| **Name** | Display name (chosen; may be a nickname) | App Functionality (identify you to your school) | Yes | No |
| **Email address** | School email, stored **hashed/normalized** in a private schema | App Functionality + Security (verify school membership) | Yes | No |
| **User ID** | Account id (Supabase auth uid) | App Functionality | Yes | No |
| **Other user content** | Listings, offers, messages, wishlist, community posts, reports you file, uploaded item **photos** | App Functionality | Yes | No |
| **Customer support** | Content of reports / support contacts | App Functionality (safety, moderation) | Yes | No |
| **Sensitive info** | Optional **graduation year** (a coarse age signal) | App Functionality (school context) | Yes | No |
| **Diagnostics** | Minimal crash/error logs (no third-party analytics SDK) | App Functionality / stability | Not linked | No |

> **Photos**: only images the user deliberately attaches to a listing are uploaded;
> they are stored in a school/listing-scoped bucket and shown to verified members of
> that school. The photo-library permission string reflects this.

## Data types NOT collected

Precise location, coarse location, physical address, phone number, contacts,
health/fitness, financial/payment info, browsing history, search history from other
apps, advertising identifiers (IDFA), purchase history, audio, gameplay content.

## Deletion & retention (App Store expects this to be described)

Users can **edit their profile**, **download their data**, and **request account
deletion** in-app (Settings → Account & privacy). Deletion is soft/reversible, then
anonymized; safety/transaction/audit records are retained de-identified. See
[`ACCOUNT_DELETION_AND_RETENTION.md`](../ACCOUNT_DELETION_AND_RETENTION.md).

## Google Play Data safety (parallel answers)

- Data collected & linked: Name, Email, User IDs, App activity (your content),
  Photos (item images), Messages (in-app).
- Data is **encrypted in transit**; users **can request deletion**; **no data shared
  with third parties** for ads; **no tracking**.
