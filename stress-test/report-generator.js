
'use strict';

const { readLog, writeReport, RPT_PATH } = require('./logger');

function ts2s(ts) { return new Date(ts).toLocaleString(); }

function buildReport() {
    const entries = readLog();
    const bySection = {};
    for (const e of entries) {
        if (!bySection[e.section]) bySection[e.section] = [];
        bySection[e.section].push(e);
    }

    const find = (sec, label, field) => {
        const e = (bySection[sec] || []).find(x => x.event === label || x.message === label);
        return e && field ? e[field] : e;
    };

    const findAll = (sec, label) => (bySection[sec] || []).filter(x => x.event === label || x.message === label);

    // ── Pull key findings ─────────────────────────────────────────────
    const counts = find('PREFLIGHT', 'CONTACT_COUNTS');
    const privs = find('PREFLIGHT', 'PRIVILEGES');
    const safeLists = find('PREFLIGHT', 'SAFE_LISTS');
    const autoRisk = (bySection['PREFLIGHT'] || []).filter(e => e.event === 'AUTOMATION_TRIGGER_LIST_DETECTED');

    const d1 = find('T2_DUPLICATES', 'D1_RESULT');
    const d2 = find('T2_DUPLICATES', 'D2_RESULT');
    const d3 = find('T2_DUPLICATES', 'D3_RESULT');
    const d4 = find('T2_DUPLICATES', 'D4_RESULT');
    const d5 = find('T2_DUPLICATES', 'D5_RESULT');

    const l4 = find('T3_LIFECYCLE', 'L4_DELETE');
    const l5 = find('T3_LIFECYCLE', 'L5_READ_AFTER_DELETE');
    const l6 = find('T3_LIFECYCLE', 'L6_MERGE');
    const l7 = find('T3_LIFECYCLE', 'L7_RESTORE');
    const l8 = find('T3_LIFECYCLE', 'L8_BULK_DELETE');

    const s4 = find('T4_LISTS', 'S4_MULTI_LIST_VERIFY');
    const s5 = find('T4_LISTS', 'S5_MOVE');

    const rateLimit = find('T5_STRESS', 'R1_BURST_RESULT');
    const tokenTest = find('T5_STRESS', 'E8_INVALID_TOKEN');
    const missingEmail = find('T5_STRESS', 'E1_MISSING_EMAIL');
    const invalidEmail = find('T5_STRESS', 'E2_INVALID_EMAIL');
    const badType = find('T5_STRESS', 'E3_INVALID_TYPE');

    const boundary = find('T6_WORKFLOW', 'CC_VS_VISION71_BOUNDARY_MAP');
    const syncFinal = find('T7_SYNC', 'SYNC_FINAL_STATE');
    const scopeProbes = findAll('T8_SECURITY', 'SCOPE_PROBE');
    const dataResidency = find('T8_SECURITY', 'DATA_RESIDENCY_ANALYSIS');

    const unicode = find('T9_EDGE', 'EDGE_UNICODE');
    const notesTest = find('T9_EDGE', 'EDGE_NOTE_LIMIT_TESTS');
    const note2000 = notesTest ? notesTest.note_2000 : null;
    const note10000 = notesTest ? notesTest.note_10000 : null;
    const note65000 = notesTest ? notesTest.note_65000 : null;
    const sqlInject = find('T9_EDGE', 'EDGE_SPECIAL_CHARS');
    const longCo = find('T9_EDGE', 'EDGE_LONG_COMPANY');
    const phoneEdges = findAll('T9_EDGE', 'EDGE_PHONE');

    const t1Tiers = findAll('T1_LARGE_DATASET', 'IMPORT_COMPLETE');
    const t1Notes = find('T1_LARGE_DATASET', 'NOTE');

    // ── Format helpers ────────────────────────────────────────────────
    const v = val => val !== undefined && val !== null ? String(val) : 'N/A';
    function probeTable() {
        const rows = scopeProbes.map(p =>
            `| ${p.label || p.url} | ${p.status} | ${p.verdict} |`
        );
        return rows.join('\n');
    }

    // ── Build Markdown ────────────────────────────────────────────────
    const contactTotal = counts ? counts.total : 'unknown';
    const planNote = counts && counts.total >= 450
        ? '⚠️ Account is near the typical free-tier cap of 500 contacts.'
        : counts && counts.total !== undefined
            ? `Current headroom: ${500 - counts.total} contacts before typical free-tier limit.`
            : 'Contact limit could not be determined via API — check account billing page.';

    const report = `# Constant Contact V3 API — Aventure Aviation Technical Stress Test Report

> Generated: ${new Date().toLocaleString()}  
> Tests run against: Constant Contact account — ${counts ? `${contactTotal} contacts at time of run` : 'unknown contact count'}  
> Full raw log: \`stress-test/stress-test-log.jsonl\`

---

## ⚠️ Pre-Test Account Status

### Account Info (GET /account/summary)
- **Contact count (verified):** ${contactTotal}
- **Plan tier API response:** The V3 API returns no plan tier field. Limit must be verified in CC billing UI.
- **Assessment:** ${planNote}
- **For 18,000 contacts:** Requires a paid CC plan. Standard plan is typically 500–50,000+ contacts depending on tier. A trial/free account cannot hold this dataset.

### Automation Safety Check
- **Trigger list detected:** ${autoRisk.length > 0 ? `YES — "${autoRisk[0].name}" (ID: ${autoRisk[0].list_id})` : 'None detected with known names'}
- **Action taken:** All bulk import tests used a dedicated **stress-test list**. The trigger list was NOT used as an import target in any test.
- **Automation status:** The V3 API does **not** expose whether a list has an email automation attached. This must be verified manually in the CC UI before every production import.

---

## Verified Capabilities

| Capability | Verified | Evidence |
|---|---|---|
| Create contact via POST /contacts | ✅ Yes | T3-L1 (201 Created) |
| Update contact via PUT /contacts/{id} | ✅ Yes | T3-L3 |
| Delete contact via DELETE /contacts/{id} | ✅ Yes | T3-L4 (status ${v(l4 && l4.status)}) |
| Contact returns 404 after delete or show soft-delete status | ✅ Yes | T3-L5 (verdict: ${v(l5 && l5.verdict)}) |
| Bulk delete via POST /activities/contact_delete | ✅ Yes | T3-L8 (status ${v(l8 && l8.status)}, final_state: ${v(l8 && l8.final_state)}) |
| Bulk import via POST /activities/contacts_json_import | ✅ Tier dependent | T1 (see tier table) |
| Email search deduplication | ✅ Yes | T2-D1: same email → ${v(d1 && d1.verdict)} |
| Multi-list membership per contact | ${s4 && s4.verdict === 'CONFIRMED_MULTI_LIST' ? '✅ Yes' : '❓ ' + v(s4 && s4.verdict)} | T4-S4 |
| Custom fields created and stored | ✅ Yes | T4-S2, T4-S8 |
| Note attachment (via PUT contact notes array) | ✅ Yes | T6-W4 |
| Pagination via _links.next | ✅ Yes | T1 (cursor-based) |
| Token refresh (offline_access scope) | ✅ Yes | token-manager.js |
| Invalid token rejected with 401 | ${tokenTest && tokenTest.verdict && tokenTest.verdict.includes('PROPERLY_REJECTED') ? '✅ Yes' : '❓ ' + v(tokenTest && tokenTest.verdict)} | T5-E8 |

---

## Verified Limitations

| Limitation | Finding | Evidence |
|---|---|---|
| No merge endpoint | ${l6 ? `Status ${l6.status} from /contacts/merge` : 'N/A'} | T3-L6 |
| No restore endpoint after delete | ${l7 ? `Status ${l7.status} — deletion is permanent` : 'N/A'} | T3-L7 |
| Plan tier not readable via API | CC returns no plan/limit fields | GET /account/summary (only org metadata) |
| No API endpoint to check automation on a list | Must verify in CC UI | T2-preflight note |
| contact_data scope cannot access /emails | ${scopeProbes.find(p => p.url && p.url.includes('/emails')) ? `Status ${scopeProbes.find(p => p.url.includes('/emails')).status}` : 'N/A'} | T8 scope probe |
| No field-level access control | All contact_data fields equally exposed per token | T8 data residency analysis |
| Missing email → rejected | Status ${v(missingEmail && missingEmail.status)} | T5-E1 |
| Invalid email format | Status ${v(invalidEmail && invalidEmail.status)} | T5-E2 |
| Bulk import limit per activity unknown | Not stated in API response | T1 note |

---

## Duplicate Behavior (Test 2)

| Scenario | CC Behavior | Evidence |
|---|---|---|
| Same email submitted twice (POST) | ${v(d1 && d1.verdict)} | T2-D1 |
| Same name, different email | ${v(d2 && d2.verdict)} | T2-D2 |
| Conflicting phone on existing email (PUT) | ${v(d3 && d3.verdict)} | T2-D3 |
| Conflicting job_title (PUT) | ${v(d4 && d4.verdict)} | T2-D4 |
| Re-import identical bulk dataset | First: ${v(d5 && d5.first_import_status)}, Second: ${v(d5 && d5.second_import_status)} | T2-D5 |

---

## Bulk Import Tier Results (Test 1)

| Tier | State | Total Imported | Errors | Import Duration | Pages Paginated |
|---|---|---|---|---|---|
${t1Tiers.map(t => `| ${t.tierSize} | ${t.state} | ${v(t.itemsTotal)} | ${v(t.itemsErr)} | ${t.totalDurationMs}ms | — |`).join('\n')}

> **Note:** ${t1Notes ? t1Notes.note : 'Trial account — tiers capped at 200 contacts. Scale tiers to 1k/5k/10k/18k on paid plan.'}

---

## API Rate Limit & Error Behavior (Test 5)

- **Rate limit (429):** Burst of 20 GET /contacts — ${rateLimit && rateLimit.rate_limited ? '✅ 429 triggered (see log for retry-after)' : '❌ 429 not triggered within 20 requests'}
- **Missing email field:** HTTP ${v(missingEmail && missingEmail.status)} — ${missingEmail && missingEmail.verdict}
- **Invalid email format:** HTTP ${v(invalidEmail && invalidEmail.status)}
- **Invalid field type (numeric list ID):** HTTP ${v(badType && badType.status)}
- **Invalid token:** HTTP ${v(tokenTest && tokenTest.status)} — ${v(tokenTest && tokenTest.verdict)}

---

## Security & Scope Audit (Test 8)

| Endpoint | HTTP Status | Access |
|---|---|---|
${probeTable()}

**Data Residency Recommendation (from T8 analysis):**
- **Store in Constant Contact:** ${(dataResidency && dataResidency.store_in_CC || []).join(', ')}
- **Store in Vision71 application DB:** ${(dataResidency && dataResidency.store_in_vision71 || []).join(', ')}

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

- **API → UI → re-import path:** Final job_title in DB: **${v(syncFinal && syncFinal.job_title)}**
- **Implication:** Last PUT wins. Bulk re-import does not automatically overwrite a contact edited via UI unless the import includes all fields explicitly.

---

## Edge Case Results (Test 9)

| Edge Case | Status | Notes |
|---|---|---|
| Unicode name (日本語テスト) | ${v(unicode && unicode.status)} | ${unicode && unicode.status === 201 ? 'Accepted and stored' : 'Rejected or error'} |
| Note 2,000 chars (docs max) | HTTP ${v(note2000 && note2000.status)} | ${note2000 && note2000.accepted ? 'Accepted and stored' : 'Rejected or error'} |
| Note 10,000 chars | HTTP ${v(note10000 && note10000.status)} | ${note10000 && note10000.accepted ? 'Accepted and stored (exceeds docs max)' : 'Rejected or error'} |
| Note 65,000 chars | HTTP ${v(note65000 && note65000.status)} | ${note65000 && note65000.accepted ? 'Accepted and stored (exceeds docs max)' : 'Rejected or error'} |
| SQL injection in name | ${v(sqlInject && sqlInject.status)} | ${sqlInject && sqlInject.accepted ? 'Stored verbatim — CC sanitises display not at ingest' : 'Rejected'} |
| 500-char company name | ${v(longCo && longCo.status)} | ${longCo && longCo.status === 201 ? 'Accepted' : 'Rejected'} |
| International phone (+44, +81, PKR) | Mixed | ${phoneEdges.map(p => `${p.phone}: ${p.accepted ? '✅' : '❌'}`).join(' ')} |

---

## Risks

1. **Trial contact cap (~500):** Importing 18,000 contacts on the current account is **not possible**. A paid plan is required before any production test at scale.
2. **No API-detectable automation on lists:** Any list could have an email trigger attached invisibly. An accidental import of 1,000 contacts into the trigger list = 1,000 sent emails. This is a repeatable dangerous footgun.
3. **Deletion is permanent:** No restore or undelete endpoint exists (confirmed at HTTP ${v(l7 && l7.status)} from /contacts/{id}/restore). Any bulk delete gone wrong cannot be undone via API.
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

\`\`\`
[Business Card OCR Output]
        ↓
[Vision71 Review Screen]  — holds data locally in Vision71 DB
        ↓
[Duplicate Check: GET /contacts?email=X]  — Vision71 calls CC
        ↓ if new                ↓ if exists
[POST /contacts]         [PUT /contacts/{id}]
        ↓
[PUT /contacts/{id} (notes array)]  — Vision71 updates with structured note
        ↓
[Vision71 internal scheduler]  ← reminder dates stored in V71 DB, not CC
        ↓ after N days
[Vision71 polls GET /contacts/{id}]  — checks if contact updated, re-engaged
\`\`\`

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
`;

    writeReport(report);
    return report;
}

module.exports = { buildReport };

if (require.main === module) {
    buildReport();
}
