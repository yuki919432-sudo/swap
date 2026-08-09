# SWAP! — Product Completeness Master Plan

**What SWAP! is:** a **closed, invitation-only, school-based marketplace and community
utility** — *not* an attention-maximizing social product. The first controlled pilot
is a **Florida boarding high school**. Access is invitation-only, membership is
school-verified, and every school is strictly isolated from every other.

**Goal:** take SWAP! to a **public App Store release** (starting from that pilot),
autonomously, while surfacing *now* everything that would be expensive to fix late.

Read it in three passes:
1. **§1 Decisions (locked)** — the choices that shape everything, now set by the
   product owner.
2. **§2 Completeness matrix** — the full domain-by-domain inventory.
3. **§3 Execution sequence** (in the owner's priority order) + **§4 Human-only
   dependencies** + **§5 Non-goals**.

Legend — **Status:** ✅ done · 🟡 partial (backend/scaffold exists, surface/wiring
missing) · ⬜ missing. **Tier:** `P1` pilot-required · `P2` public-launch-required ·
`P3` post-launch. **Retrofit risk:** 🟥 high · 🟧 medium · 🟩 low.

---

## 0. Pilot definition (locked)

The first controlled pilot is a **Florida boarding high school**. The product must
support **high-school students (13+) safely** via:

- **Invitation-only access** (the school gates who gets in)
- **Verified school membership** + **strict school isolation** (RLS, already enforced)
- **No users under 13** (hard age floor)
- **No advertising**, **no payments**
- **Reporting and blocking** + **human moderation capability**
- **Account deletion** + **data minimization**
- **Safe campus handoff locations** (school-approved, no home addresses / live GPS)

High-school users are **in scope** — the pilot is **not** switching to university-only.
COPPA concerns services directed to / knowingly collecting data from **children under
13**; the app therefore **prohibits under-13 accounts** but otherwise serves 13–18
students normally. The boarding-school + invitation-only model means the **school is
the gatekeeper/consent authority** for enrolment.

---

## 0.1 Where we are today (grounded snapshot)

Nine checkpoints shipped (Phase 1A–1H + wishlist polish). The **hard-to-change
foundations are already correct**:

- **Multi-tenant isolation** via Postgres RLS is the source of truth; every change is
  a migration; security changes ship with pgTAP. (31 migrations, 22 pgTAP files / 311
  assertions, mobile 132 + server 79 unit tests, CI authoritative.)
- **Repository abstraction** (interface + Mock + Supabase) isolates data-source and
  transport swaps from screens.
- Backends often assumed missing but **already present**: Trust & Safety (`0012` —
  `reports`, `blocks`, `moderation_actions`, append-only audit + enums), data-retention
  lifecycle (`0020`), email-OTP challenge/verify (`0026`), reservation invariant
  (`0009`), offers/handoff (`0031`).
- **Discovery is already finite by design** — deterministic shelves + category pages +
  search/filters, *no* infinite scroll, no invented popularity metrics. This matches
  the product stance (§1.C) and needs no change.

Remaining work is weighted toward **mobile surfaces, production wiring, infra, legal,
and store readiness** — not risky rewrites.

---

## 1. Decisions (locked by product owner)

### A. Language / localization
- **English is the only pilot language.** Do **not** spend a checkpoint on full
  multilingual support before the core app is complete; **defer Japanese** until a real
  Japanese launch plan exists.
- Allowed (lightweight, non-blocking): keep user-facing copy **organized in a shared
  structure** so localization can be added later; avoid hardcoding text where a simple
  shared copy module is practical; English is the default + fallback.
- Net: a **light shared-copy module** (not a full i18n framework / not a translation
  effort) folded into normal screen work — **not** its own major checkpoint.

### B. Target users / age
- **High-school pilot stays.** Not university-only.
- **Age floor 13** — under-13 accounts prohibited (age gate at onboarding).
- Safeguards per §0 (invitation-only, verified membership, isolation, reporting,
  moderation, deletion, data minimization, safe handoff).

### C. Feed & engagement design (product stance)
SWAP! is a **utility**, not an attention machine. **Do not** add infinite scrolling to
imitate social media. Keep Campus Market structured around:
- **finite discovery shelves**, **explicit category pages**, **search & filters**,
- **pagination or a visible "Load more"** where needed, **clear stopping points**.

**Disabled for the pilot:** autoplay video · livestreaming · public like/repost
metrics · engagement streaks · **push-notification delivery**.

### D. Images (user-uploaded)
Real users upload photos → a safety path is required. **Pilot: report-driven takedown**
(+ human moderation). Automated image screening (a pluggable hook, no paid vendor
assumed) added **before public launch**. 🟥 retrofit if skipped.

### E. Money / ads
**Non-transactional through launch** (give / swap / borrow / lend only) and **no
advertising**. Payments, if ever, are a separate post-launch track.

### F. Notifications
**In-app activity feed only** for the pilot (events already recorded by `src/activity`).
**Push delivery stays OFF.** Push *plumbing* (device tokens/permission) is **P3 /
deferred** — not built during pilot priorities.

### G. Realtime vs polling
Messaging stays **poll-based** for pilot (swap to Supabase Realtime is behind the repo
interface, 🟩). No early lock.

---

## 2. Completeness matrix

### A. Identity, auth, onboarding & age gate
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Real Supabase auth (JWT + RLS) | ✅ | P1 | 🟩 | `sign-in.tsx` |
| Email-OTP challenge/verify **backend** | ✅ | P1 | 🟩 | `0026` |
| **Invitation-only redemption UI** | ⬜ | P1 | 🟧 | backend exists; school-gated enrolment |
| **Age gate (13+, reject under-13)** | ⬜ | P1 | 🟧 | onboarding step; store age-rating input |
| Production onboarding UX (welcome → school → verify → enter) | 🟡 | P1 | 🟧 | screens not yet built |
| Password reset / session refresh UX | ⬜ | P1 | 🟩 | |
| Consent to policies at signup | ⬜ | P1 | 🟩 | ties to §P |
| Sign in with Apple (only if other social login added) | ⬜ | P2 | 🟧 | not needed if email-only |

### B. Trust & Safety
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Reports / blocks / moderation-actions / audit **schema** | ✅ | P1 | 🟩 | `0012` |
| Local content moderation (text) | ✅ | P1 | 🟩 | simulator on listings/offers/wishlist |
| **Report UI** (listing / user / message) | ⬜ | P1 | 🟧 | backend ready; needs mobile flow + repo |
| **Human moderation tools / review queue** | ⬜ | P1 | 🟧 | consume `reports`; role-gated |
| Block / unblock management UI | 🟡 | P1 | 🟩 | block exists in messaging; needs settings surface |
| Report-from-thread | ⬜ | P1 | 🟩 | |
| Image report → takedown (D) | ⬜ | P1 | 🟧 | |
| Automated image screening | ⬜ | P2 | 🟥 | pluggable hook, pre-public |
| Rate-limit / spam throttles (surfaced) | 🟡 | P2 | 🟧 | server primitives exist; wire to writes |

### C. Account lifecycle & privacy
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| **In-app account deletion** | ⬜ | P1 | 🟧 | store-required; cascades/retention modelled (`0020`) |
| **Data export** ("download my data") | ⬜ | P1 | 🟧 | owner prioritized it at P1 |
| Data minimization review | ⬜ | P1 | 🟧 | collect only what's needed (minor-safe) |
| Sign-out everywhere / session revoke | ⬜ | P2 | 🟩 | |
| PII inventory + data-flow doc | ⬜ | P1 | 🟧 | feeds privacy policy + store labels |

### D. Profile & settings
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Profile view (mine / others) | 🟡 | P1 | 🟩 | needs edit |
| **Edit profile** (name, avatar, bio) | ⬜ | P1 | 🟩 | |
| Real **Settings** (privacy, blocked list, account, legal links, notif prefs) | 🟡 | P1 | 🟧 | `settings.tsx` is demo-profile switching today |

### E. Notifications (pilot: in-app only)
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Activity event model + recorder | ✅ | P1 | 🟩 | `src/activity` |
| In-app activity feed surface | ⬜ | P1 | 🟩 | render recorded events |
| Push plumbing / delivery | ⬜ | P3 | 🟧 | **OFF for pilot** (§1.F) |

### F. Marketplace / offers / discovery  *(core journey — already built)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Listings CRUD + images + search/filter | ✅ | P1 | 🟩 | |
| Offers (give/swap/borrow/lend) + atomic reserve + handoff | ✅ | P1 | 🟩 | Phase 1H |
| Wishlist + matches + demand + message-owner | ✅ | P1 | 🟩 | |
| Campus markets + stalls | ✅ | P1 | 🟩 | Phase 1F |
| **Finite shelves / category pages / Load-more** | 🟡 | P1 | 🟩 | shelves finite already; add category pages + Load-more where lists can grow |
| Safe handoff locations (school-approved) | 🟡 | P1 | 🟩 | model supports `proposed_location_id`; ensure UX uses approved spots |
| Listing expiry / auto-archive job | 🟡 | P2 | 🟩 | scheduled runner |

### G. Reliability, ops & data
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Loading / error / empty states | 🟡 | P1 | 🟩 | strong in new screens; audit older |
| Retry / backoff surfaced | 🟡 | P2 | 🟩 | server primitives exist |
| **Crash reporting** | ⬜ | P1 | 🟧 | needed to run a pilot |
| **Structured logging + error alerting** | 🟡 | P1 | 🟩 | audit log exists; add app/infra logging |
| **Backup / restore policy** | ⬜ | P1 | 🟩 | provider-level; document + verify |
| Product analytics (provider-agnostic, no ads) | ⬜ | P2 | 🟧 | privacy-respecting event layer |
| Staging environment | ⬜ | P2 | 🟩 | |

### H. Data, privacy & security (platform)
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| RLS tenant isolation + tests | ✅ | P1 | 🟩 | authoritative |
| SECURITY DEFINER search_path + privilege allowlist | ✅ | P1 | 🟩 | pgTAP-guarded |
| Secrets client-safe; service-role server-only | ✅ | P1 | 🟩 | |
| Storage object RLS (school/listing scoped) | ✅ | P1 | 🟩 | |
| Security-review pass | ⬜ | P2 | 🟧 | run `/security-review` pre-public |

### I. Infra & environments  *(your accounts / secrets)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| **Pilot/release build configuration (EAS)** | ⬜ | P1 | 🟧 | first priority; config = me, credentials = you |
| Production Supabase project | ⬜ | P1 | 🟧 | you provision |
| Prod env config + secret management | 🟡 | P1 | 🟩 | `.env.example` exists; prod values from you |
| Transactional email (OTP delivery) | ⬜ | P1 | 🟧 | you pick/fund |
| Image storage bucket (prod) | 🟡 | P1 | 🟩 | policies designed |

### J. Accessibility & localization
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Light shared-copy module (English) | ⬜ | P1 | 🟩 | **not** a full i18n effort (§1.A) |
| Accessibility labels / dynamic type / contrast | 🟡 | P2 | 🟧 | pass before public |
| Japanese / multilingual | ⬜ | P3 | 🟧 | **deferred** until a JA launch plan |

### K. Quality & release
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Unit + pgTAP + integration + CI | ✅ | P1 | 🟩 | authoritative |
| E2E of key journeys | ⬜ | P2 | 🟧 | before public |
| **Real-device QA + TestFlight pilot** | ⬜ | P1 | 🟥 | human-only — you/tester |
| Release checklist / versioning | ⬜ | P2 | 🟩 | |

### L. Legal & store  *(I draft, you/counsel finalise)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Privacy Policy (minor-aware, no ads) | ⬜ | P1 | 🟧 | store-required, hosted URL |
| Terms of Service / EULA | ⬜ | P1 | 🟧 | UGC apps need an EULA |
| Community guidelines | ⬜ | P2 | 🟩 | |
| App icons / splash / assets | ⬜ | P1 | 🟩 | |
| Store metadata / screenshots | ⬜ | P2 | 🟧 | screenshots need device (you) |
| Privacy nutrition labels | ⬜ | P1 | 🟩 | from PII inventory |
| Review-guideline audit (UGC: report+block+EULA+moderation) | ⬜ | P2 | 🟧 | |
| Support / contact channel | ⬜ | P1 | 🟩 | store-expected |

---

## 3. Execution sequence (owner's priority order)

I proceed autonomously (build → verify → PR → self-merge on green), pausing only for
§4 human-only items. Each numbered block is one or more checkpoints.

> **Status (2026-08-09): the engineering track is complete.** Release Steps 1–7 are
> built, tested, and merged to `main`:
> 1 app-mode/EAS build config · 2 auth + 13+ age gate + membership UX ·
> 3 reporting + human moderation · 4 account deletion + export + profile ·
> 5 production-env readiness (preflight + bootstrap scripts) · 6 full real-backend
> E2E QA · 7 App Store submission pack.
> The only work left before Submit is **human-only** — see
> [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).

1. **Pilot / release build configuration** — EAS build profiles (dev/preview/prod),
   env/secret plumbing (values from you), app config (bundle id, version), CI → build
   wiring. *(Light shared-copy module introduced here so later screens use it.)*
2. **Authentication, age gate & membership UX** — welcome → school → **invitation-only
   redemption** → **email-OTP verify** → **age gate (13+)** → enter; password reset;
   consent to policies. Real, not demo.
3. **Reporting & human moderation tools** — report flow (listing/user/message + from
   thread), moderator review queue over the `reports` table, block/unblock management,
   image report → takedown.
4. **Account deletion, export, profile & settings** — in-app account deletion, data
   export, data-minimization review, edit profile, real Settings (privacy, blocked
   list, account, legal links).
5. **Existing end-to-end marketplace journey** — verify + polish the full loop
   (list → discover via finite shelves/category pages/search → offer → handoff at a
   safe location → complete) on the real backend; add category pages + Load-more where
   lists grow; in-app activity feed.
6. **Reliability, logging, backup & operational readiness** — crash reporting,
   structured logging + alerting, backup/restore policy, error/empty-state audit,
   retry surfacing, staging env.
7. **Legal & App Store preparation** — Privacy Policy / ToS / EULA / guidelines drafts,
   consent wiring, privacy nutrition labels + PII inventory, icons/splash, store
   metadata, support channel, review-guideline audit, security-review pass.
8. **Real-device & TestFlight pilot QA** — EAS build to TestFlight, device QA of the
   full journey, E2E of key flows, release checklist. *(Human: Apple Developer account,
   device testing.)*

---

## 4. Human-only dependencies (I cannot do these)

- **Accounts & money:** Apple Developer account; production Supabase project;
  transactional email provider; (optional) crash/analytics vendor; domain for
  policy/support pages.
- **Secrets:** you create them; I wire them via env/config — never handling raw values
  or committing them.
- **Real-device QA:** tapping through the built app; store screenshots.
- **Legal sign-off:** I draft Privacy Policy / ToS / EULA / guidelines; you or counsel
  approve and host.
- **App Store submission:** you upload/submit.
- **Pilot logistics:** the boarding school's invitation list, email domain for
  verification, and approved on-campus handoff locations.

---

## 5. Non-goals (explicitly OUT for the pilot)

Infinite scrolling · autoplay video · livestreaming · public like/repost metrics ·
engagement streaks · **push-notification delivery** · advertising · payments/deposits ·
ratings/reviews · Japanese / multilingual localization · a university-only pivot ·
users under 13 · describing SWAP! as an attention-maximizing social product.

---

## 6. Open item (non-blocking)

- **Pilot school email domain** for OTP verification (e.g. `@school.org`) — needed at
  step 2; can be provided later.

---

*Living document — as checkpoints land I tick items and keep the matrix current, so
"what's left" is always visible at a glance.*
