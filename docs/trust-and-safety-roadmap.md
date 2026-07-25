# Trust & Safety — Roadmap (recorded, NOT yet implemented)

> **Status: DECISION RECORD ONLY.** Nothing in this document is built yet. Trust &
> Safety is the **mandatory next checkpoint** and must be designed, approved, and
> implemented **before** any listing / community-post CRUD is exposed. This file
> exists so the decision is captured; it is not an authorization to start building.

## Why T&S gates content CRUD

SWAP! lets students publish content (listings, looking-for, community posts,
events, messages). The moment any create/update path is exposed, unmoderated
content can reach other students. Therefore the moderation pipeline must exist and
be enforced **before** publish paths go live — not bolted on afterward.

## Model: publish-after-automated-checks (no routine approval queue)

- Content publishes **after passing automated checks**, not after a human approves
  it. There is **no routine admin approval queue** for normal posts — that does not
  scale and is not the model.
- Automated check outcomes: **allow**, **warn**, **block**, **escalate**.
  - `allow` — publishes normally.
  - `warn` — publishes, but flagged/labeled or surfaced to the author with guidance.
  - `block` — refused at publish time with a safe, non-leaky reason.
  - `escalate` — held or published-then-queued for **human review**.
- **Human review happens after the fact**, triggered by: user **reports**, author
  **appeals**, **severe** classifications, or **repeated** abuse patterns — not as a
  gate on every post.

## Classification surface

The policy engine classifies across:

- **Text** (title, description, messages) — prohibited content, harassment, spam,
  scams, regulated-goods language.
- **Images** — prohibited/explicit content, regulated goods.
- **Metadata** — category, price signals, links, contact-info patterns.
- **PII** — detect and discourage sharing personal contact details, addresses,
  government IDs.
- **Spam** — volume, repetition, templated cross-posting.
- **Prohibited categories** — the existing `prohibited_categories` list plus policy
  additions.

## Separation: policy engine vs. product

The **policy engine is a separate component** from the marketplace/community
product code. Product code calls the engine at publish/edit time and acts on the
returned outcome; the engine owns the rules, thresholds, and model integrations.
This keeps policy independently testable and swappable, and keeps external
AI-moderation providers behind an interface (as with the email provider).

## Policy differs by school type (HS vs. university)

High-school and university communities need **different policies**. Policy is
selected by the school's type/segment, not hard-coded globally.

### Regulated goods (tobacco / nicotine / vaping / alcohol)

- **Disabled by default in the MVP** for every school.
- **High schools can NEVER enable** these categories.
- **Universities** may only enable them after an explicit review gate:
  **jurisdiction**, **age**, **campus policy**, and **legal review** must all pass.
  This is a deliberate, auditable configuration change — never a casual toggle.

## Hard constraints on automation

- **AI alone can never permanently ban** a user. A permaban requires human review.
  Automated actions are limited to allow/warn/block/escalate and reversible holds.
- **Editing published content re-triggers moderation.** An approved post that is
  edited is re-evaluated before the edit goes live (no "edit past the filter").

## Interaction with existing primitives

- Reports already exist (`reports`, `report_target_type`, `report_reason`) and will
  feed the human-review queue.
- Audit logging (`app.write_audit`, immutable `audit_logs`) will record moderation
  decisions and configuration changes (e.g. a university enabling a regulated
  category).
- Membership state (`suspended` / `rejected`) is the enforcement lever for
  account-level actions; T&S decisions drive those transitions through the existing
  guarded RPCs.

## Not in scope for the current (Email OTP) checkpoint

External AI moderation, the policy engine, listing/community CRUD, dashboards, and
production deployment are **explicitly out of scope** here and must wait for the
T&S checkpoint to be designed and approved.
