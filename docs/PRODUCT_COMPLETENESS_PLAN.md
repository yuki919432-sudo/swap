# SWAP! — Product Completeness Master Plan

**Goal:** take SWAP! all the way to a **public App Store release**, autonomously,
while surfacing *now* everything that would otherwise be discovered "too late to
fix cheaply."

This document is the antidote to the fear of *"we finished, then realised a critical
feature was missing."* It enumerates **every domain** a real, published, student
marketplace needs, marks what already exists, and — most importantly — flags the
handful of **decisions that must be locked early** because retrofitting them is
expensive.

Read it in three passes:
1. **§1 Decisions to lock now** — the small set of choices that shape everything.
2. **§2 Completeness matrix** — the full domain-by-domain inventory (status / tier /
   retrofit-risk).
3. **§3 Execution sequence** + **§4 What I need from you** — how it gets built and
   the human-only dependencies.

Legend — **Status:** ✅ done · 🟡 partial (backend or scaffold exists, surface/wiring
missing) · ⬜ missing. **Tier:** `P1` pilot-required · `P2` public-launch-required ·
`P3` post-launch. **Retrofit risk:** how painful to add late — 🟥 high (touches data
model / cross-cutting) · 🟧 medium · 🟩 low (additive, behind an interface).

---

## 0. Where we are today (grounded snapshot)

Nine checkpoints shipped (Phase 1A–1H + wishlist polish). The **hard-to-change
foundations are already correct**, which is what most de-risks "too late":

- **Multi-tenant isolation** via Postgres RLS is the source of truth; every change
  ships as a migration; security changes ship with pgTAP tests. (31 migrations, 22
  pgTAP files / 311 assertions, mobile 132 + server 79 unit tests, CI authoritative.)
- **Repository abstraction** (interface + Mock + Supabase) means data-source and even
  transport swaps (e.g. poll → realtime) don't touch screens.
- Backends that people assume are missing but **already exist**: Trust & Safety
  (`0012` — `reports`, `blocks`, `moderation_actions`, append-only audit + enums),
  data-retention lifecycle (`0020`), email-OTP challenge/verify (`0026`), reservation
  invariant (`0009`), offers/handoff (`0031`).

So the remaining work is weighted toward **mobile surfaces, production wiring, infra,
legal, and store readiness** — not risky rewrites.

---

## 1. Decisions to lock NOW (retrofit-risk first)

These are the choices that are cheap today and expensive after launch. Each has a
**recommended default** so we can move without stalling; tell me only where you differ.

| # | Decision | Why it can't wait | Recommended default |
|---|----------|-------------------|---------------------|
| D1 | **Primary language / localization** 🟥 | All UI copy is currently English. If the pilot school is Japanese-speaking, building more English-only screens then retrofitting i18n touches every screen. | **Introduce an i18n layer now** (keys + a locale file), author **Japanese + English**, default by device locale. Decide the pilot school's language. |
| D2 | **Do we admit minors (high-school, <18)?** 🟥 | Under-18 users trigger COPPA/again-legal duties, App Store age-rating, parental-consent and data-minimisation rules that shape onboarding + the data model. The app already models `high_school`. | **Pilot with university (18+) only**; keep high-school behind a flag until a compliant minor-onboarding + policy pass is done. Confirm. |
| D3 | **Verification method for the pilot school** 🟧 | Onboarding UX + which providers we build. Backend supports email-OTP, invite-code, manual. | **Email-OTP on the school's domain** (`@school.edu`) as primary + invite-code fallback. Confirm the school's email domain. |
| D4 | **Push notifications: in scope for launch?** 🟧 | Even if we don't *send* yet, the **device-token table + permission prompt + Expo push plumbing** should be laid so it isn't a later rewrite. | **Build the plumbing now, keep sending OFF** until you approve. In-app activity feed ships first (events already recorded). |
| D5 | **User-uploaded photo moderation** 🟥 | Real users upload images; a public app needs a safety path for imagery (report + takedown at minimum; automated screening ideally). Text is already screened. | **Ship report-driven takedown for images at pilot**; add automated image screening (a pluggable hook, no paid vendor yet) before public. |
| D6 | **Money: stay non-transactional through launch?** 🟧 | Payments change legal status, store rules (IAP vs physical goods), and T&S. Scope has excluded them. | **Yes — launch as give/swap/borrow/lend only.** Revisit payments as a post-launch track. Confirm. |
| D7 | **Realtime vs polling for messaging** 🟩 | Low risk (behind the repo interface) but affects infra cost/UX. | **Keep polling for pilot**, swap to Supabase Realtime before public if usage warrants. No early lock needed. |
| D8 | **Analytics/observability vendor** 🟧 | Event taxonomy should be designed once; the sink can be swapped. | **Define a provider-agnostic event layer now** (no-op sink), wire a free-tier crash/analytics vendor at infra time (your accounts). |

**Only D1, D2, D5 are truly "now" (🟥).** The rest have safe defaults I'll proceed
with unless you say otherwise.

---

## 2. Completeness matrix

### A. Identity, auth & onboarding
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Real Supabase auth (JWT + RLS) | ✅ | P1 | 🟩 | `sign-in.tsx` email+password against real backend |
| Email-OTP challenge/verify **backend** | ✅ | P1 | 🟩 | migration `0026` + server pkg |
| Production **onboarding UI** (welcome → school pick → verify → enter) | 🟡 | P1 | 🟧 | screens for the OTP/verification journey not yet built |
| Invite-code redemption UI | ⬜ | P1 | 🟩 | backend exists |
| Password reset / magic-link / session refresh UX | ⬜ | P1 | 🟩 | |
| OAuth (Apple/Google) sign-in | ⬜ | P2 | 🟧 | **Sign in with Apple is App-Store-required if any other social login is offered** |
| Re-verification / school change / graduation offboarding | ⬜ | P3 | 🟧 | |

### B. Trust & Safety
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Reports / blocks / moderation-actions / audit **schema** | ✅ | P1 | 🟩 | `0012_trust_safety` |
| Local content moderation (text) | ✅ | P1 | 🟩 | simulator, used on listings/offers/wishlist |
| **Report UI** (report a listing / user / message) | ⬜ | P1 | 🟧 | backend ready; needs mobile flow + repo |
| Block/unblock management UI | 🟡 | P1 | 🟩 | block exists in messaging; needs a settings surface |
| **Moderator review surface / queue** | ⬜ | P1 | 🟧 | consume the reports table; role-gated |
| Image moderation path (see D5) | ⬜ | P2 | 🟥 | report-driven takedown → automated screening |
| Rate-limiting / spam / abuse throttles (surfaced) | 🟡 | P2 | 🟧 | server pkg has ratelimit primitives; wire to write paths |
| Content policy / community guidelines (in-app) | ⬜ | P2 | 🟩 | pairs with legal docs (§P) |

### C. Minors, age & compliance  *(gated by D2)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Age gate / DOB or 18+ attestation | ⬜ | P1* | 🟥 | only if minors admitted |
| Parental-consent flow (COPPA-style) | ⬜ | P2* | 🟥 | high-school path |
| Data-minimisation for minors | ⬜ | P2* | 🟥 | |

### D. Account lifecycle
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| **In-app account deletion** | ⬜ | P1 | 🟧 | **App Store REQUIRES this** for account-creating apps; cascades/retention largely modelled (`0020`) |
| Data export ("download my data") | ⬜ | P2 | 🟧 | privacy-law expectation |
| Deactivate / pause account | ⬜ | P3 | 🟩 | |
| Sign-out everywhere / session revoke | ⬜ | P2 | 🟩 | |

### E. Notifications
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| In-app **activity event model + recorder** | ✅ | P1 | 🟩 | `src/activity` (matches/unavailable/fulfilled/demand) |
| In-app **activity feed surface** | ⬜ | P1 | 🟩 | render the recorded events |
| Push plumbing (device tokens, permission, Expo) | ⬜ | P2 | 🟧 | **build now per D4**, sending OFF |
| Push sending + preferences | ⬜ | P3 | 🟩 | behind user prefs |

### F. Messaging
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| 1:1 threads, send, block, unread, system messages | ✅ | P1 | 🟩 | Phase 1G |
| Poll-based updates | ✅ | P1 | 🟩 | interface allows realtime swap (D7) |
| Read receipts / typing / realtime | ⬜ | P3 | 🟩 | |
| Report-from-thread | ⬜ | P1 | 🟩 | ties to §B report UI |
| Attachments in chat | ⬜ | P3 | 🟧 | needs image moderation (D5) |

### G. Marketplace / offers / handoff
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Listings CRUD + images + search/filter | ✅ | P1 | 🟩 | |
| Offers (give/swap/borrow/lend) + atomic reserve + handoff | ✅ | P1 | 🟩 | Phase 1H |
| Wishlist + matches + demand + message-owner | ✅ | P1 | 🟩 | just shipped |
| Campus markets + stalls | ✅ | P1 | 🟩 | Phase 1F |
| Listing expiry / auto-archive job | 🟡 | P2 | 🟩 | retention modelled; needs a scheduled runner |
| Offer `expires_at` enforcement (a scheduler) | ⬜ | P3 | 🟩 | noted in Phase 1H limitations |

### H. Search & discovery
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Text search + filters + deterministic shelves | ✅ | P1 | 🟩 | trigram + recommendation engine |
| Saved searches / recent searches | ⬜ | P3 | 🟩 | |
| Empty/zero-result guidance | 🟡 | P2 | 🟩 | present in places; audit for coverage |

### I. Profile & settings
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Profile view (mine / others) | 🟡 | P1 | 🟩 | exists; needs edit |
| **Edit profile** (name, avatar, bio) | ⬜ | P1 | 🟩 | |
| Real **Settings** (notif prefs, privacy, blocked list, account, legal links) | 🟡 | P1 | 🟧 | `settings.tsx` is currently demo-profile switching |
| Verification status / school badge | 🟡 | P2 | 🟩 | |

### J. Data, privacy & security
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| RLS tenant isolation + tests | ✅ | P1 | 🟩 | authoritative |
| SECURITY DEFINER search_path pinning + privilege allowlist | ✅ | P1 | 🟩 | pgTAP-guarded |
| Secrets never in client; service-role server-only | ✅ | P1 | 🟩 | enforced |
| PII inventory + data-flow doc | ⬜ | P2 | 🟧 | needed for privacy policy + review |
| Storage object RLS (per school/listing) | ✅ | P1 | 🟩 | |
| Backup / restore / disaster policy | ⬜ | P2 | 🟩 | provider-level |
| Pen-test / security review pass | ⬜ | P2 | 🟧 | run `/security-review` before public |

### K. Infra & environments  *(your accounts / secrets)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Production Supabase project | ⬜ | P1 | 🟧 | **you provision** (paid) |
| Prod env config + secret management | 🟡 | P1 | 🟩 | `.env.example` exists; needs prod values |
| Transactional email provider (OTP delivery) | ⬜ | P1 | 🟧 | **you pick/fund** (SES/Resend/Postmark) |
| Image storage bucket (prod) + CDN | 🟡 | P1 | 🟩 | policies designed; provision at infra time |
| CI/CD → EAS build pipeline | 🟡 | P2 | 🟧 | CI green; add EAS build/submit config + credentials |
| Staging environment | ⬜ | P2 | 🟩 | |

### L. Observability
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Crash reporting (Sentry/Expo) | ⬜ | P1 | 🟧 | **needed to run a pilot** |
| Product analytics (provider-agnostic event layer) | ⬜ | P2 | 🟧 | design taxonomy now (D8) |
| Server/DB logging + error alerting | 🟡 | P2 | 🟩 | audit log exists; add alerting |

### M. Performance, offline & resilience
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Loading/error/empty states | 🟡 | P1 | 🟩 | strong in new screens; audit older ones |
| Network-failure retry/backoff | 🟡 | P2 | 🟩 | present in server pkg; surface in app |
| Offline read cache | ⬜ | P3 | 🟧 | |
| List virtualisation / image perf | 🟡 | P2 | 🟩 | audit long lists |

### N. Accessibility & localization
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| i18n layer + JA/EN copy | ⬜ | P1 | 🟥 | **D1 — decide + build early** |
| Accessibility labels / dynamic type / contrast | 🟡 | P2 | 🟧 | some labels present; needs a pass |
| RTL readiness | ⬜ | P3 | 🟩 | |

### O. Quality, testing & release
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Unit + pgTAP + integration + CI | ✅ | P1 | 🟩 | authoritative |
| E2E flows (Detox/Maestro) | ⬜ | P2 | 🟧 | key journeys before public |
| Real-device QA | ⬜ | P1 | 🟥 | **human-only — you or a tester** |
| EAS build + TestFlight/internal distribution | ⬜ | P1 | 🟧 | credentials = you; config = me |
| Release checklist / versioning | ⬜ | P2 | 🟩 | |

### P. Legal & policy  *(I draft, you/counsel finalise)*
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| Privacy Policy | ⬜ | P1 | 🟧 | **store-required**; hosted URL |
| Terms of Service / EULA | ⬜ | P1 | 🟧 | store-required |
| Community guidelines | ⬜ | P2 | 🟩 | |
| Consent to policies at onboarding | ⬜ | P1 | 🟩 | |

### Q. App Store submission
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| App icons / splash / adaptive assets | ⬜ | P1 | 🟩 | |
| Store metadata / description / keywords | ⬜ | P2 | 🟩 | |
| Screenshots (all device sizes) | ⬜ | P2 | 🟧 | needs real-device captures (you) |
| **Privacy nutrition labels** | ⬜ | P1 | 🟩 | derived from PII inventory (§J) |
| Account-deletion requirement met | ⬜ | P1 | 🟧 | see §D |
| Review-guideline audit (UGC safety, Apple sign-in) | ⬜ | P2 | 🟧 | UGC apps need report + block + EULA + moderation |

### R. Growth & ops
| Item | Status | Tier | Retrofit | Notes |
|---|---|---|---|---|
| School onboarding / admin tooling | 🟡 | P2 | 🟧 | roster/verification config exists |
| Support / contact / feedback channel | ⬜ | P1 | 🟩 | store-expected |
| Basic web landing page | ⬜ | P2 | 🟩 | hosts policy links |

---

## 3. Proposed execution sequence

Grouped into two milestones. Each row is roughly one checkpoint (build → verify → PR
→ self-merge on green). I proceed autonomously; I pause only at the decision points in
§1 and the human-only items in §4.

### Milestone A — **Pilot-ready** (a real school can use it)
1. **i18n foundation + JA/EN copy** (D1) — retire hard-coded strings.
2. **Production onboarding & auth UX** — welcome → school → email-OTP/invite verify →
   enter (D3); password reset; consent to policies.
3. **Trust & Safety surfaces** — report flow (listing/user/message), moderator review
   queue, block management, report-from-thread.
4. **Account lifecycle** — in-app account deletion + sign-out-everywhere; profile edit;
   real Settings (prefs, privacy, blocked list, legal links).
5. **In-app activity feed** — render the recorded events; push *plumbing* (D4, off).
6. **Observability + resilience** — crash reporting; loading/error/empty audit across
   older screens; retry surfacing.
7. **Legal drafts + policy consent + support channel** (I draft; you/counsel finalise).
8. **Pilot hardening** — security-review pass, PII inventory, E2E of key journeys.
   → *Human: provision prod Supabase + email; TestFlight build; real-device QA.*

### Milestone B — **Public launch**
9. Image moderation path (D5) · Apple sign-in (if social login) · rate-limit/abuse
   surfacing · scheduled jobs (expiry/archival) · analytics taxonomy (D8).
10. Accessibility pass · performance pass · staging env · E2E breadth.
11. Store readiness — icons/splash, metadata, screenshots, privacy labels,
    guideline audit, account-deletion verification.
12. Release pipeline — EAS build/submit config, versioning, release checklist.
    → *Human: Apple Developer account, store submission, legal sign-off.*

> Minors (D2) and payments (D6) are **separate opt-in tracks**, not on the default
> path to launch.

---

## 4. What I need from you (human-only — I cannot do these)

- **Accounts & money:** Apple Developer account; production Supabase project;
  transactional email provider; (optional) crash/analytics vendor; domain for
  policy/landing.
- **Secrets:** you create them, I wire them via env/config — I never handle raw
  secret values or commit them.
- **Real-device QA:** tapping through the built app on a phone; store screenshots.
- **Legal sign-off:** I draft Privacy Policy / ToS / guidelines; you or counsel
  approve and host them.
- **App Store submission:** you upload/submit (as you offered).
- **Product decisions:** the §1 items where you differ from the recommended default.

---

## 5. Open questions (answer these and I run)

1. **D1 language:** is the pilot school Japanese-speaking? Ship JA+EN, default which?
2. **D2 minors:** university-only for pilot (recommended), or must high-school ship too?
3. **D3 verification:** what's the pilot school's email domain? OTP + invite-code OK?
4. **D5 images:** report-driven takedown at pilot, automated screening before public — OK?
5. **D6 payments:** confirm non-transactional through launch.
6. Anything you consider must-have that you don't see represented above?

---

*This plan is a living document — as checkpoints land I'll tick items and keep the
matrix current, so "what's left" is always visible at a glance.*
