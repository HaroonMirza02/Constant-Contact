
'use strict';

/**
 * TEST 1 — Large dataset simulation
 * Imports synthetic contacts in batches using the bulk import endpoint,
 * then exercises GET pagination + email search against each tier.
 *
 * Tiers tested: 10 (warm-up), 50, 200  (scaled down from 1k/5k/10k/18k
 * because trial accounts cap at 500 contacts — the code is parameterised
 * and will log a TIER_BLOCKED notice the moment a bulk import returns a
 * non-2xx for capacity reasons).
 */

const api = require('./api');
const { generateBatch } = require('./generators');
const { logNotice, logError } = require('./logger');

const SEC = 'T1_LARGE_DATASET';
const BULK_ENDPOINT = '/activities/contacts';
const BATCH_POLL_INTERVAL_MS = 2000;
const BATCH_POLL_RETRIES = 15;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pollActivity(activityId) {
    for (let i = 0; i < BATCH_POLL_RETRIES; i++) {
        const r = await api.get(SEC, `/activities/${activityId}`);
        if (!r.ok) return r;
        const state = r.body.state;
        logNotice(SEC, 'ACTIVITY_POLL', { activityId, state, attempt: i + 1 });
        if (['complete', 'completed', 'error'].includes((state || '').toLowerCase())) return r;
        await sleep(BATCH_POLL_INTERVAL_MS);
    }
    logError(SEC, 'ACTIVITY_POLL_TIMEOUT', { activityId });
    return { ok: false, body: { state: 'TIMEOUT' } };
}

async function importTier(tierSize, listId, customFieldId) {
    const section = `${SEC}_TIER_${tierSize}`;
    console.log(`\n  [T1] Importing ${tierSize} synthetic contacts...`);
    const t0 = Date.now();

    const contacts = generateBatch(tierSize);

    // Bulk import payload
    const importBody = {
        import_data: contacts.map(c => ({
            email: c.email,
            first_name: c.first_name,
            last_name: c.last_name,
            company_name: c.company_name,
            job_title: c.job_title,
            phone: c.phone_numbers[0].phone_number
        })),
        lists: [listId]
    };

    const importRes = await api.post(section, BULK_ENDPOINT, importBody);
    const importDuration = Date.now() - t0;

    if (!importRes.ok) {
        logError(section, 'IMPORT_FAILED', { status: importRes.status, body: importRes.body, tierSize });
        console.warn(`    ❌ Import ${tierSize} failed — status ${importRes.status}`);
        if (importRes.status === 403 || importRes.status === 402) {
            console.warn('    🔴 BLOCKER: Tier/plan restriction. Higher tier required.');
            logError(section, 'TIER_BLOCKED', { tierSize, status: importRes.status });
        }
        return { tierSize, ok: false, status: importRes.status };
    }

    const activityId = importRes.body.activity_id;
    logNotice(section, 'IMPORT_ACCEPTED', { activityId, importDuration, tierSize });
    console.log(`    ✅ Import accepted. activity_id=${activityId}. Polling...`);

    const pollRes = await pollActivity(activityId);
    const totalDuration = Date.now() - t0;

    const state = pollRes.body ? pollRes.body.state : 'UNKNOWN';
    const errors = pollRes.body ? pollRes.body.activity_errors || [] : [];
    const pctDone = pollRes.body ? pollRes.body.percent_done : null;
    const itemsTotal = pollRes.body ? (pollRes.body.items_total_count || pollRes.body.contacts_count || null) : null;
    const itemsErr = pollRes.body ? (pollRes.body.error_count || 0) : 0;

    logNotice(section, 'IMPORT_COMPLETE', {
        tierSize, state, errors, pctDone, itemsTotal, itemsErr, totalDurationMs: totalDuration
    });

    console.log(`    state=${state}  pct=${pctDone}  total=${itemsTotal}  errors=${itemsErr}  duration=${totalDuration}ms`);

    // ── Pagination test against this tier ───────────────────────────
    console.log(`  [T1] Pagination test on list ${listId} after ${tierSize} import...`);
    const pagT0 = Date.now();
    let pageCount = 0, contactsFound = 0, cursor = null;
    let slowPage = false;

    do {
        const url = cursor
            ? `/contacts?lists[]=${listId}&limit=500&${cursor}`
            : `/contacts?lists[]=${listId}&limit=500`;
        const pgRes = await api.get(section, url);
        const pgDuration = Date.now() - pagT0;

        if (!pgRes.ok) {
            logError(section, 'PAGINATION_FAIL', { page: pageCount, status: pgRes.status });
            break;
        }

        const items = pgRes.body.contacts || [];
        contactsFound += items.length;
        pageCount++;
        if (pgRes.durationMs > 3000) { slowPage = true; }

        // Extract next cursor from _links if present
        const next = pgRes.body._links && pgRes.body._links.next
            ? pgRes.body._links.next.href : null;

        if (next) {
            // href is like /contacts?..., grab the query string
            const qs = next.split('?')[1];
            cursor = qs || null;
        } else {
            cursor = null;
        }

        if (pageCount >= 10) { // hard cap to avoid exhausting rate limit
            logNotice(section, 'PAGINATION_CAP_HIT', { pageCount, contactsFound });
            break;
        }
    } while (cursor);

    const pagDuration = Date.now() - pagT0;
    logNotice(section, 'PAGINATION_RESULT', { tierSize, pages: pageCount, contactsFound, totalMs: pagDuration, slowPage });
    console.log(`    Pagination: ${pageCount} page(s), ${contactsFound} contacts fetched, ${pagDuration}ms, slowPage=${slowPage}`);

    // ── Email search test ────────────────────────────────────────────
    const sampleEmail = contacts[Math.floor(contacts.length / 2)].email;
    console.log(`  [T1] Search test: ${sampleEmail}`);
    const srchRes = await api.get(section, `/contacts?email=${encodeURIComponent(sampleEmail)}&include=list_memberships`);
    logNotice(section, 'SEARCH_RESULT', {
        email: sampleEmail,
        found: srchRes.ok && (srchRes.body.contacts || []).length > 0,
        durationMs: srchRes.durationMs
    });

    return { tierSize, ok: true, state, itemsTotal, itemsErr, importDurationMs: importDuration, totalDurationMs: totalDuration, pagDuration, slowPage };
}

async function run(stressListId, customFieldId) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T1  L A R G E   D A T A S E T   S I M U L A T I O N');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    logNotice(SEC, 'NOTE', {
        note: 'Trial accounts cap at ~500 contacts. Tiers are 10/50/200 to stay within limit. ' +
            'Code is parameterised; uncomment 1000/5000/10000/18000 once on a paid plan.'
    });

    const tiers = [10, 50, 200]; // Scale up to [1000,5000,10000,18000] on paid tier
    const results = [];

    for (const tier of tiers) {
        try {
            const result = await importTier(tier, stressListId, customFieldId);
            results.push(result);
        } catch (err) {
            logError(SEC, 'TIER_EXCEPTION', { tier, message: err.message });
            results.push({ tierSize: tier, ok: false, message: err.message });
        }
    }

    return results;
}

module.exports = { run };
