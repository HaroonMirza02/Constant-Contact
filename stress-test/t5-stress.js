
'use strict';

/**
 * TEST 5 — API stress & error boundary testing
 * • Intentional rate-limit trigger (rapid burst)
 * • Token expiry simulation
 * • Malformed payloads
 * • Missing required fields
 * • Invalid field types
 */

const api = require('./api');
const { logNotice, logError } = require('./logger');

const SEC = 'T5_STRESS';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run(stressListId) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T5  A P I   S T R E S S   T E S T I N G');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ── R1 · Rapid burst to trigger rate limit (Concurrent) ───────────
    console.log('[R1] Burst 40 concurrent GET /contacts requests...');
    const promises = [];
    for (let i = 0; i < 40; i++) {
        promises.push(api.get(SEC, `/contacts?limit=1`).then(r => ({ seq: i, status: r.status, durationMs: r.durationMs })));
    }
    const burstResults = await Promise.all(promises);
    const rlHits = burstResults.filter(b => b.status === 429);
    const rlHit = rlHits.length > 0;
    logNotice(SEC, 'R1_BURST_RESULT', { burst: burstResults, rate_limited: rlHit, rate_limit_hit_count: rlHits.length });
    console.log(`  Rate limit hit: ${rlHit} (${rlHits.length} of 40 requests returned 429)`);

    // ── R2 · Retry after rate limit (backoff) ─────────────────────────
    if (rlHit) {
        console.log('[R2] Sleeping 10s then retrying after 429...');
        await sleep(10000);
        const retryR = await api.get(SEC, '/contacts?limit=5');
        logNotice(SEC, 'R2_RETRY_RESULT', { status: retryR.status, recovered: retryR.ok });
        console.log(`  → retry status: ${retryR.status}`);
    }

    // ── E1 · Missing email (required field) ───────────────────────────
    console.log('[E1] POST /contacts with missing email...');
    const e1 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        first_name: 'NoEmail', last_name: 'Test',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'E1_MISSING_EMAIL', { status: e1.status, body: e1.body, verdict: e1.status >= 400 ? 'REJECTED_AS_EXPECTED' : 'ACCEPTED_UNEXPECTEDLY' });
    console.log(`  → status: ${e1.status} (expected 4xx)`);

    // ── E2 · Invalid email format ─────────────────────────────────────
    console.log('[E2] POST /contacts with invalid email format...');
    const e2 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: 'not-an-email', permission_to_send: 'implicit' },
        first_name: 'Bad', last_name: 'Email',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'E2_INVALID_EMAIL', { status: e2.status, body: e2.body });
    console.log(`  → status: ${e2.status} (expected 4xx)`);

    // ── E3 · Invalid field types ──────────────────────────────────────
    console.log('[E3] PUT /contacts with numeric string as list_membership...');
    const e3 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `typeerror.${Date.now()}@stress.test`, permission_to_send: 'implicit' },
        list_memberships: [12345]    // should be UUID string
    });
    logNotice(SEC, 'E3_INVALID_TYPE', { status: e3.status, body: e3.body });
    console.log(`  → status: ${e3.status}`);

    // ── E4 · Empty body ───────────────────────────────────────────────
    console.log('[E4] POST /contacts with empty body...');
    const e4 = await api.post(SEC, '/contacts', {});
    logNotice(SEC, 'E4_EMPTY_BODY', { status: e4.status, body: e4.body });
    console.log(`  → status: ${e4.status}`);

    // ── E5 · Non-existent contact ID ─────────────────────────────────
    console.log('[E5] GET /contacts/{fake-id}...');
    const e5 = await api.get(SEC, '/contacts/00000000-0000-0000-0000-000000000000');
    logNotice(SEC, 'E5_FAKE_ID', { status: e5.status, body: e5.body });
    console.log(`  → status: ${e5.status} (expected 404)`);

    // ── E6 · Invalid list ID in contact creation ──────────────────────
    console.log('[E6] POST /contacts with non-existent list ID...');
    const e6 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `badlist.${Date.now()}@stress.test`, permission_to_send: 'implicit' },
        first_name: 'Bad', last_name: 'List',
        list_memberships: ['00000000-0000-0000-0000-000000000000']
    });
    logNotice(SEC, 'E6_BAD_LIST', { status: e6.status, body: e6.body });
    console.log(`  → status: ${e6.status}`);

    // ── E7 · Missing create_source ────────────────────────────────────
    console.log('[E7] POST /contacts without create_source...');
    const e7 = await api.post(SEC, '/contacts', {
        email_address: { address: `nosource.${Date.now()}@stress.test`, permission_to_send: 'implicit' },
        first_name: 'No', last_name: 'Source',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'E7_MISSING_SOURCE', { status: e7.status, body: e7.body });
    console.log(`  → status: ${e7.status}`);

    // ── E8 · Token expiry simulation ──────────────────────────────────
    console.log('[E8] Simulating expired token (sending garbage bearer)...');
    const e8 = await api.get(SEC, '/contacts?limit=1', { 'Authorization': 'Bearer INVALID_TOKEN_STRESS_TEST' });

    logNotice(SEC, 'E8_INVALID_TOKEN', {
        status: e8.status, body: e8.body,
        verdict: e8.status === 401 ? 'PROPERLY_REJECTED_401' : 'UNEXPECTED_' + e8.status
    });
    console.log(`  → status: ${e8.status} (expected 401)`);

    // Verify real token still works
    const e8recovery = await api.get(SEC, '/contacts?limit=1');
    logNotice(SEC, 'E8_TOKEN_RECOVERY', { status: e8recovery.status });
    console.log(`  → recovery status: ${e8recovery.status}`);
}

module.exports = { run };
