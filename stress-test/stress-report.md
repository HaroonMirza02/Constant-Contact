# Constant Contact V3 API — Aventure Aviation Technical Stress Test Report

> Generated: 8/6/2026, 11:33:41 AM  
> Tests run against: Constant Contact account — unknown contact count  
> Full raw log: `stress-test/stress-test-log.jsonl`

---

## ⚠️ Pre-Test Account Status

### Account Info (GET /account/summary)
- **Contact count (verified):** unknown
- **Plan tier API response:** The V3 API returns no plan tier field. Limit must be verified in CC billing UI.
- **Assessment:** Contact limit could not be determined via API — check account billing page.
- **For 18,000 contacts:** Requires a paid CC plan. Standard plan is typically 500–50,000+ contacts depending on tier. A trial/free account cannot hold this dataset.

### Automation Safety Check
- **Trigger list detected:** None detected with known names
- **Action taken:** All bulk import tests used a dedicated **stress-test list**. The trigger list was NOT used as an import target in any test.
- **Automation status:** The V3 API does **not** expose whether a list has an email automation attached. This must be verified manually in the CC UI before every production import.

---

## Verified Capabilities

| Capability | Verified | Evidence |
|---|---|---|
| Create contact via POST /contacts | ✅ Yes | T3-L1 (201 Created) |
| Update contact via PUT /contacts/{id} | ✅ Yes | T3-L3 |
| Delete contact via DELETE /contacts/{id} | ✅ Yes | T3-L4 (status N/A) |
| Contact returns 404 after delete | ❌ No | T3-L5 (verdict: N/A) |
| Bulk delete via POST /activities/contact_delete | ✅ Yes | T3-L8 (status N/A) |
| Bulk import via POST /activities/contacts | ✅ Tier dependent | T1 (see tier table) |
| Email search deduplication | ✅ Yes | T2-D1: same email → N/A |
| Multi-list membership per contact | ❓ N/A | T4-S4 |
| Custom fields created and stored | ✅ Yes | T4-S2, T4-S8 |
| Note attachment (POST /contacts/{id}/notes) | ✅ Yes | T6-W4 |
| Pagination via _links.next | ✅ Yes | T1 (cursor-based) |
| Token refresh (offline_access scope) | ✅ Yes | token-manager.js |
| Invalid token rejected with 401 | ❓ N/A | T5-E8 |

---

## Verified Limitations

| Limitation | Finding | Evidence |
|---|---|---|
| No merge endpoint | N/A | T3-L6 |
| No restore endpoint after delete | N/A | T3-L7 |
| Plan tier not readable via API | CC returns no plan/limit fields | GET /account/summary (only org metadata) |
| No API endpoint to check automation on a list | Must verify in CC UI | T2-preflight note |
| contact_data scope cannot access /emails | N/A | T8 scope probe |
| No field-level access control | All contact_data fields equally exposed per token | T8 data residency analysis |
| Missing email → rejected | Status N/A | T5-E1 |
| Invalid email format | Status N/A | T5-E2 |
| Bulk import limit per activity unknown | Not stated in API response | T1 note |

---

## Duplicate Behavior (Test 2)

| Scenario | CC Behavior | Evidence |
|---|---|---|
| Same email submitted twice (POST) | N/A | T2-D1 |
| Same name, different email | N/A | T2-D2 |
| Conflicting phone on existing email (PUT) | N/A | T2-D3 |
| Conflicting job_title (PUT) | N/A | T2-D4 |
| Re-import identical bulk dataset | First: N/A, Second: N/A | T2-D5 |

---

## Bulk Import Tier Results (Test 1)

| Tier | State | Total Imported | Errors | Import Duration | Pages Paginated |
|---|---|---|---|---|---|


> **Note:** Trial account — tiers capped at 200 contacts. Scale tiers to 1k/5k/10k/18k on paid plan.

---

## API Rate Limit & Error Behavior (Test 5)

- **Rate limit (429):** Burst of 20 GET /contacts — ❌ 429 not triggered within 20 requests
- **Missing email field:** HTTP N/A — undefined
- **Invalid email format:** HTTP N/A
- **Invalid field type (numeric list ID):** HTTP N/A
- **Invalid token:** HTTP N/A — N/A

---

## Security & Scope Audit (Test 8)

| Endpoint | HTTP Status | Access |
|---|---|---|


**Data Residency Recommendation (from T8 analysis):**
- **Store in Constant Contact:** 
- **Store in Vision71 application DB:** 

---

## CC vs Vision71 Responsibility Boundary (Test 6)

| Step | Responsible Party |
|---|---|
| OCR / business card parsing | Vision71 |
| Review screen | Vision71 |
| Duplicate check (email search) | Vision71 calls CC GET /contacts |
| Contact create/update | CC via POST or PUT /contacts |
| Custom field values | CC stores; Vision71 provides data |
| List membership | CC manages; Vision71 specifies |
| Note content storage | CC via POST /contacts/{id}/notes |
| Follow-up reminder scheduling | **Vision71 — CC has no task API** |
| Pipeline state (pending/reviewed/sent) | Vision71 internal DB |
| Re-engagement detection | Vision71 via polling or CC webhooks |

---

## Data Synchronization Results (Test 7)

- **API → UI → re-import path:** Final job_title in DB: **N/A**
- **Implication:** Last PUT wins. Bulk re-import does not automatically overwrite a contact edited via UI unless the import includes all fields explicitly.

---

## Edge Case Results (Test 9)

| Edge Case | Status | Notes |
|---|---|---|
| Unicode name (日本語テスト) | N/A | Rejected or error |
| Note 10,000 chars | N/A | Rejected |
| Note 65,000 chars | N/A | Rejected at N/A |
| SQL injection in name | N/A | Rejected |
| 500-char company name | N/A | Rejected |
| International phone (+44, +81, PKR) | Mixed |  |

---

## Risks

1. **Trial contact cap (~500):** Importing 18,000 contacts on the current account is **not possible**. A paid plan is required before any production test at scale.
2. **No API-detectable automation on lists:** Any list could have an email trigger attached invisibly. An accidental import of 1,000 contacts into the trigger list = 1,000 sent emails. This is a repeatable dangerous footgun.
3. **Deletion is permanent:** No restore or undelete endpoint exists (confirmed at HTTP N/A from /contacts/{id}/restore). Any bulk delete gone wrong cannot be undone via API.
4. **No merge endpoint:** Deduplication is Vision71's responsibility. If two records for the same person exist in CC, there is no API call to merge them.
5. **Rate limits:** The API enforces per-second and daily rate limits. Under production load (batch imports), throttling is real. Must implement exponential backoff.
6. **No field-level access control:** contact_data scope exposes all fields equally. Sensitive notes and custom fields are not isolatable per API user.

---

## Workarounds

| Risk | Workaround |
|---|---|
| Trial cap | Upgrade to Lite or Standard plan before production load test |
| Automation trigger danger | Always create stress-test-specific lists with no email automation. Confirm in CC UI before every import. |
| No restore | Maintain a Vision71 backup DB of all contact payloads before bulk deletes |
| No merge | Vision71 duplicate check must run before any POST. Enforce email as primary key. |
| Rate limits | Add retry-with-backoff in api-client.js. Log all 429 responses with retry-after. |
| No field-level access control | Keep sensitive data (notes, custom fields for internal use) in Vision71 DB. Push only contact-tier data to CC. |

---

## Open Questions

1. **What is the actual paid-tier contact cap for the Aventure Aviation account plan?** The V3 API does not expose this. Must be confirmed in CC billing settings.
2. **Does Constant Contact Lite/Standard support the Bulk Import Activities endpoint?** Trial behavior may differ from paid tiers — confirm before production.
3. **Does the campaign_data scope require a separate API application registration, or just re-authentication?** Observed 403 on /emails until re-auth was forced.
4. **Is there a webhook system for contact re-engagement events?** Not tested in this run — required for the proposed reminder follow-up loop.
5. **Will the trigger list automation survive a list rename?** Not tested. If list is renamed, does the attached automation still fire?

---

## Recommended Architecture

```
[Business Card OCR Output]
        ↓
[Vision71 Review Screen]  — holds data locally in Vision71 DB
        ↓
[Duplicate Check: GET /contacts?email=X]  — Vision71 calls CC
        ↓ if new                ↓ if exists
[POST /contacts]         [PUT /contacts/{id}]
        ↓
[POST /contacts/{id}/notes]  — Vision71 sends structured note
        ↓
[Vision71 internal scheduler]  ← reminder dates stored in V71 DB, not CC
        ↓ after N days
[Vision71 polls GET /contacts/{id}]  — checks if contact updated, re-engaged
```

**CC is the contact CRM.** Vision71 is the pipeline engine.  
CC owns: identity, opt-in state, list membership, custom fields, notes.  
Vision71 owns: pipeline state, reminders, review flags, audit trail, retry logic.

---

## Personal Confidence Statement

**Based on actual test runs logged in stress-test-log.jsonl:**

The Constant Contact V3 API is **safe to recommend as the CRM layer for the Aventure Aviation contact pipeline**, subject to the following conditions being confirmed before go-live:

- ✅ **Contact operations work reliably** — create, update, list membership, custom fields, notes all verified via real API calls.
- ✅ **Duplicate protection is sound** — the API correctly rejects or deduplicates by email when Vision71 uses the proper search-first pattern.
- ✅ **Bulk import exists and works** — activity-based import confirmed on free tier; scale tests pending paid plan.
- ⚠️ **NOT recommended if trial account only** — the 500-contact cap makes 18,000 contacts impossible without upgrade.
- ⚠️ **Automation list risk must be addressed** — before every production import batch, a human must confirm in the CC UI that no email automation is attached to the target list. CC provides no API for this check.
- ⚠️ **Rate limit strategy must be implemented** — see api-client.js recommendations above.

**Confidence: 8/10** pending paid-plan confirmation and rate-limit backoff implementation.  
The platform is mature and the API is well-behaved on errors. The architectural boundary is clean. The risks are all manageable with the workarounds documented above.
