# Nova Bug History

This file records non-obvious bugs that are likely to recur or influence future design.

---

## 2026-06-27 — GitHub raw update delay confusion

**Visible symptom**

Tampermonkey appeared to keep using old GitHub code after a file had been changed.

**Root cause**

Raw GitHub delivery, browser caching, Tampermonkey update timing, and component cache versions were being treated as one system when they are separate layers.

**Fix / lesson**

- use explicit component versions;
- add version query parameters;
- stage updates into Nova cache;
- activate staged updates on refresh;
- do not rely on a raw file changing without a manifest/component version bump.

**Remaining risk**

A source file can be correct on GitHub while an older cached version remains active if its manifest version is unchanged.

---

## 2026-06-30 — Module visible in Tampermonkey but absent on page

**Visible symptom**

The bootstrap/userscript existed, but a module panel did not appear on Google or on its target page.

**Root causes encountered**

- match rules did not include the tested page;
- module code was loaded but not launched;
- module ownership was split between bootstrap and module loader;
- autoload state was not consistently restored.

**Fix / lesson**

Module matching, loading, launching, and visibility are different states and must be tracked separately.

**Current protection**

`nova-default-module-state.js` and the manifest autoload flags coordinate matching startup and persistent visibility.

---

## 2026-07-18 to 2026-07-20 — Autoload failed after refresh

**Visible symptom**

Modules were available in Nova Menu but did not automatically appear after refreshing the page.

**Root cause**

The loader restored code availability but did not reliably execute every enabled `autoload` module on its matching site. A one-time state migration also needed to establish sensible defaults without permanently overriding user choices.

**Fix**

Nova Default Module State was expanded to:

- launch enabled autoload modules on matching pages;
- retry startup at several delays;
- preserve later Hide/Launch choices;
- support globally allowed modules separately from match-restricted modules.

**Validation**

Martins confirmed automatic startup worked after refresh.

---

## 2026-07-20 — Relative HERO API URL rejected

**Visible symptom**

HERO module failed with an error similar to:

`TypeError: /api/fcs/.../events is not a valid URL`

**Incorrect assumption**

A relative fetch path executed from dynamically loaded userscript code would resolve exactly like page-native JavaScript.

**Root cause**

Firefox/Tampermonkey sandbox execution handled the relative URL differently in the dynamically executed module context.

**Fix**

- resolve same-origin relative URLs against `location.href`;
- preserve `credentials: 'include'`;
- add a Core compatibility bridge so existing modules do not each need an emergency patch.

**Validation**

Scout reports confirmed successful 200 responses from HERO events and event-details endpoints.

---

## 2026-07-20 — HERO defect data appeared then vanished

**Visible symptom**

A shipment briefly displayed useful defect information, then several Problem Solve rows returned to blanks or generic values.

**Root cause**

Multiple asynchronous owners were refreshing the same panel:

- the main HERO module reset `.associate`, `.reason`, and `.time` at the start of every refresh;
- HERO Failure Intelligence populated evidence independently;
- overlapping initial refreshes completed out of order;
- a later main-module reset could erase the richer evidence.

**Diagnostic clue**

Some new extension fields survived while older generic fields disappeared. That pattern proved the API read worked and the final failure was a DOM ownership race.

**Fix**

HERO Failure Intelligence `0.2.0` introduced:

- a complete route-bound evidence object;
- delayed application only after parsing completed;
- a MutationObserver over Problem Solve fields;
- automatic reapplication if populated evidence was cleared or replaced;
- route-change invalidation to prevent cross-shipment leakage.

**Remaining risk**

This is stable but still a dual-writer architecture. Native integration into the main HERO module is the proper long-term cleanup.

---

## 2026-07-21 — Generic event was shown as defect reason

**Visible symptom**

The card showed:

- Event: `ReportDefect`
- Defect: `Item reported as defective`

This proved the event occurred but did not answer whether the unit was missing, damaged, unscannable, or failed transparency/serial validation.

**Incorrect assumption**

The newest defect-related event description was sufficient as the defect reason.

**Root cause**

The parser selected the latest relevant event but did not rank structured item-level reasons above generic descriptions.

**Evidence discovered**

`FAIL_SHIPMENT` event details can contain specific nested evidence such as:

- item-level `failureReason`;
- `DefectReasonCode`;
- `DefectReasonText`;
- `shipmentFailureReason`;
- `DefectType`;
- Problem Solve container and previous condition metadata.

A specific transparency failure could exist even when a broad defect type suggested damage.

**Fix**

HERO Failure Intelligence `0.3.0`:

- searches up to the newest eight `ReportDefect`/`FAIL_SHIPMENT` events;
- parses several structured reason fields;
- chooses the first sufficiently specific candidate;
- classifies readable operational categories;
- preserves raw evidence in a separate row;
- uses `Defect reason not exposed` when no specific reason exists.

**Validation target**

A transparency event should show:

- Event: `FAIL_SHIPMENT` or `ReportDefect`
- Defect: `Transparency / serial number issue`
- Defect Evidence: the raw transparency failure code

---

## 2026-07-21 — POPS old UI flashed before Nova styling

**Visible symptom**

On refresh, the original POPS page was visible for less than a second before the modern Nova UI replaced it.

**Incorrect assumption**

A sub-second delay was an unavoidable trade-off of a manifest-managed framework.

**Root cause**

Bootstrap waited for DOM startup and a live GitHub manifest resolution before fully starting cached Core/modules. POPS then applied its styling only after the page had already painted.

**Fix**

Bootstrap `2.3.0` introduced Fast Boot:

- read cached manifest immediately;
- start cached Core without waiting for GitHub;
- move update checks into the background;
- use a prepaint/render gate for critical sites.

Nova Site Render Gate `1.0.0` keeps POPS covered until its module reports active styled controls.

**Remaining risk**

First installation has no cache and remains slower, although the render gate should hide the unfinished state.

---

## 2026-07-21 — HERO panel visibly changed after opening

**Visible symptom**

HERO opened with a panel present, then suddenly refreshed and displayed different or additional information.

**Root cause**

The main event list and several event-detail requests completed asynchronously after the panel had already been revealed.

**Fix**

Nova Site Render Gate tracks HERO shipment event/detail fetches, waits for zero pending requests and a quiet window, and only then releases the page.

**Fallback**

A maximum timeout releases the gate to avoid trapping the user behind a loading screen when readiness detection fails.

---

## Debugging pattern to preserve

When a value is wrong, distinguish these stages:

1. Did the API expose the information?
2. Did Nova request the correct endpoint?
3. Did the parser extract the correct field?
4. Did classification preserve the most specific meaning?
5. Did the UI receive the correct value?
6. Did another refresh overwrite it afterward?
7. Was evidence from an old route allowed to arrive late?

Do not patch the visible row before identifying which stage failed.
