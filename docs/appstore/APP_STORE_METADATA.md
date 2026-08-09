# App Store metadata (draft)

Copy-ready listing text for App Store Connect. Adjust the school/brand specifics
before submitting. Character limits noted where Apple enforces them.

## Identity

- **App name** (≤30): `SWAP! — Campus Exchange`
- **Subtitle** (≤30): `Give, swap & borrow at school`
- **Bundle ID:** owner-provided (replace the `test.example.swap.demo` placeholder in
  `app.json` with your real reverse-domain id before building).
- **Primary category:** Shopping (Alternative: Social Networking)
- **Secondary category:** Utilities

## Promotional text (≤170, updatable without a new build)

> A private, invite-only way for students to give away, swap, borrow, and lend
> things on campus — no money, no ads, just a lighter, greener dorm.

## Description (≤4000)

> SWAP! is a private, invitation-only marketplace and community app for verified
> students at your school. Instead of throwing things away or buying new, pass them
> on to a classmate.
>
> • Give, swap, borrow, and lend — no payments, ever.
> • School-only: everything you see is from verified students at your own school.
> • Safe by design: meet at approved on-campus handoff spots.
> • Find things with simple shelves, categories, and search — no endless feed.
> • Wishlists let classmates know what you're looking for.
>
> Built for a calmer, kinder campus:
> • No ads and no selling of your data.
> • No public like counts, no streaks, no autoplay — nothing designed to keep you
>   scrolling.
> • Report and block tools on every listing, message, and profile, with human
>   moderators at your school.
> • You control your data: edit your profile, download a copy, or delete your
>   account any time.
>
> SWAP! is for students aged 13 and up and requires an invitation from a
> participating school.

## Keywords (≤100, comma-separated, no spaces)

`swap,campus,student,dorm,marketplace,borrow,lend,secondhand,reuse,school,giveaway,exchange,thrift`

## URLs

- **Support URL:** `<https://… or the support page you host>` (also set as
  `EXPO_PUBLIC_SUPPORT_URL`)
- **Marketing URL:** `<optional>`
- **Privacy Policy URL:** `<hosted URL of docs/legal/PRIVACY_POLICY once finalized>`

## Age rating questionnaire (answer factually)

| Prompt | Answer | Why |
|--------|--------|-----|
| Unrestricted web access | **No** | No in-app browser |
| User-generated content / social features | **Yes** | listings, messages, community — **moderated** |
| Does the app have content moderation & reporting? | **Yes** | report + block + human moderation |
| Contests, gambling, mature/suggestive/violent content | **No** | prohibited by policy + filters |
| Medical/treatment info | **No** | |

Answer the UGC questions truthfully; because the app allows moderated user
communication, expect Apple to assign a mature-leaning rating. Regardless of the
store rating, the app **enforces a 13+ minimum in-app** and is not submitted to the
Kids category.

## Export compliance

Uses only standard HTTPS/TLS encryption → typically **exempt** (answer the
encryption questions accordingly; no custom cryptography).

## Screenshots (device — human step)

Capture on a real device / simulator at the required sizes (6.7" and 6.5" iPhone at
minimum): Welcome/age gate, Marketplace, Listing detail, Wishlist, Settings →
Account & privacy. See [`ASSETS.md`](ASSETS.md).
