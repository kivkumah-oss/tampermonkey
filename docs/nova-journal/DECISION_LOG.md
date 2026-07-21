# Nova Architecture Decision Log

This file records decisions that should not be casually reversed without understanding the reason behind them.

---

## ADR-001 — Nova is a framework, not a pile of standalone scripts

**Status:** Accepted

**Decision:**

New work should be built as shared Core services or manifest-managed modules rather than independent Tampermonkey scripts whenever practical.

**Why:**

Standalone scripts created duplicated UI logic, duplicated storage, inconsistent updates, and too many installed files. Nova Core allows one installed bootstrap to manage shared services and site modules.

**Consequence:**

A change to Core can improve several tools at once, but Core defects can also affect several modules. Core changes require broader testing.

---

## ADR-002 — GitHub manifest is the registry source of truth

**Status:** Accepted

**Decision:**

`nova.manifest.json` defines component identity, version, order, API name, enabled state, autoload behaviour, match rules, and source URL.

**Why:**

This makes the runtime inspectable and allows modules to be added, updated, disabled, or reordered without reinstalling separate scripts.

**Consequence:**

Every source change that must invalidate cache needs a corresponding component version bump. Significant releases also bump the manifest version and timestamp.

---

## ADR-003 — Normal refresh must start from cache, not GitHub

**Status:** Accepted

**Decision:**

Bootstrap uses the active cached manifest and cached component code first. GitHub update checks happen after startup.

**Why:**

Waiting for a live manifest request before starting Core caused visible delays and made page rendering depend on network latency.

**Consequence:**

Updates activate on the next refresh after they are staged. First installation remains slower because no cache exists yet.

---

## ADR-004 — Critical pages use a render gate

**Status:** Accepted

**Decision:**

POPS and HERO should not reveal their unfinished intermediate state while Nova is still applying UI or hydrating investigation data.

**Why:**

Users saw the original POPS interface flash before the modern module applied. HERO displayed a partially filled panel and then visibly replaced values when asynchronous event-detail requests completed.

**Consequence:**

The user sees a short Nova preparation screen instead of an unstable page. A safety timeout must always release the gate if readiness detection fails.

---

## ADR-005 — Operational meaning outranks generic event labels

**Status:** Accepted

**Decision:**

Display event type and operational reason separately.

Example:

- Event: `ReportDefect`
- Defect: `Item missing`

**Why:**

`ReportDefect` describes the action but does not tell an investigator why it happened. Showing it as the defect reason is technically true but operationally useless.

**Consequence:**

Parsers must inspect event details and prefer structured reason fields over generic descriptions.

---

## ADR-006 — Specific item-level failure reason wins

**Status:** Accepted

**Decision:**

When several reason fields exist, use the most specific item-level or reason-code evidence before broad shipment or defect type values.

Current order:

1. item-level `failureReason`;
2. `DefectReasonCode`;
3. `DefectReasonText`;
4. `shipmentFailureReason`;
5. `DefectType`;
6. event description.

**Why:**

A broad defect type can say damaged while the actual specific reason is a transparency or serial-number validation failure.

**Consequence:**

Classification code must preserve both the readable label and raw evidence.

---

## ADR-007 — Never invent missing operational evidence

**Status:** Accepted

**Decision:**

When HERO exposes only a generic defect event and no specific reason, display `Defect reason not exposed`.

**Why:**

A guessed category could produce a false bridge or send an investigator down the wrong path.

**Consequence:**

Unknown is a valid result. Nova should be honest about evidence limits.

---

## ADR-008 — Route-bind asynchronous evidence

**Status:** Accepted

**Decision:**

Evidence produced by asynchronous HERO requests must be tied to the exact URL, FC, and shipment that initiated the request.

**Why:**

Single-page navigation and delayed responses can otherwise place stale information from one shipment into the next shipment panel.

**Consequence:**

Route changes invalidate pending request generations and clear cached page-specific evidence.

---

## ADR-009 — Protect fields from competing refresh owners

**Status:** Accepted as an interim compatibility design

**Decision:**

HERO Failure Intelligence keeps a complete route-bound evidence object and reapplies it when another refresh clears or replaces populated fields.

**Why:**

The existing HERO module reset generic Problem Solve fields during overlapping refreshes. Correct data appeared briefly and then disappeared.

**Consequence:**

The UI is stable, but there are currently two writers. Long term, parsing and refresh ownership should be consolidated into the main HERO module.

---

## ADR-010 — Same-origin API requests stay same-origin and authenticated

**Status:** Accepted

**Decision:**

HERO modules use absolute same-origin URLs derived from `location.href` with `credentials: 'include'`.

**Why:**

Relative `/api/...` URLs failed inside the Firefox/Tampermonkey dynamic execution environment even though the same paths worked in page code.

**Consequence:**

Core provides a compatibility bridge, and new modules should avoid assuming relative fetch behaves identically in every userscript sandbox.

---

## ADR-011 — Preserve user module visibility choices

**Status:** Accepted

**Decision:**

Autoload determines default startup, but a user Hide/Launch choice must survive refreshes.

**Why:**

Forcing every module visible on each page load made the UI feel uncontrollable and broke the meaning of module controls.

**Consequence:**

One-time migrations may establish a new default, but later startup respects stored visibility state.

---

## ADR-012 — Diagnostics must be safe by default

**Status:** Accepted

**Decision:**

Nova Trace, DOM Inspector, API Body Catcher, and Investigation Export should capture enough structure to debug without routinely storing credentials or raw sensitive bodies.

**Why:**

The project needs evidence, but debugging convenience does not justify leaking tokens, cookies, personal data, or unnecessary internal payloads.

**Consequence:**

Raw response capture is omitted or redacted unless a controlled investigation specifically requires it.
