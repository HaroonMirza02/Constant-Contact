
'use strict';

/**
 * PREFLIGHT — runs before every other test.
 * Two mandatory checks:
 *   P1. Account info + contact count (plan tier / limit question)
 *   P2. List automation safety guard (detect & warn if any list has
 *       active automation attached that could fire emails on import)
 *
 * If P1 returns a hard blocker, PREFLIGHT throws and the runner stops.
 */

const api = require('./api');
const { logNotice, logError } = require('./logger');

const SEC = 'PREFLIGHT';

async function run() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('P  R  E  F  L  I  G  H  T');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ── P1 · Account summary ──────────────────────────────────────────
    console.log('[P1] GET /account/summary ...');
    const summary = await api.get(SEC, '/account/summary');
    if (!summary.ok) {
        logError(SEC, 'Account summary failed — cannot proceed', { status: summary.status });
        throw new Error(`Preflight P1 failed: ${JSON.stringify(summary.body)}`);
    }
    console.log(`     org: ${summary.body.organization_name}, tz: ${summary.body.time_zone_id}`);

    // ── P1b · Contact counts ──────────────────────────────────────────
    console.log('[P1] GET /contacts/counts ...');
    const counts = await api.get(SEC, '/contacts/counts');
    if (counts.ok) {
        const c = counts.body;
        console.log(`     total=${c.total}  implicit=${c.implicit}  explicit=${c.explicit}  unsubscribed=${c.unsubscribed}`);
        logNotice(SEC, 'CONTACT_COUNTS', counts.body);

        // Warn if already very close to typical 500-contact trial cap
        if (c.total >= 450) {
            logError(SEC, 'TRIAL_CAP_RISK', {
                current: c.total, threshold: 450,
                note: 'Free/trial accounts often cap at 500 contacts. Bulk import may be blocked.'
            });
            console.warn(`  ⚠️  WARNING: ${c.total} contacts already in account. Trial cap may be ~500.`);
        } else {
            console.log(`  ✅ Contact headroom looks adequate for initial tests.`);
        }
    } else {
        logError(SEC, 'CONTACTS_COUNTS_FAILED', counts.body);
        console.warn('  ⚠️  Could not fetch /contacts/counts — proceeding with caution.');
    }

    // ── P1c · User privileges (scope audit) ───────────────────────────
    console.log('[P1] GET /account/user/privileges ...');
    const privs = await api.get(SEC, '/account/user/privileges');
    if (privs.ok) {
        const names = (privs.body.privileges || []).map(p => p.privilege_name || p);
        logNotice(SEC, 'PRIVILEGES', { privileges: names });
        console.log(`     privileges: ${names.join(', ')}`);

        const needCampaign = names.some(n => /campaign/i.test(n));
        if (!needCampaign) {
            logNotice(SEC, 'NO_CAMPAIGN_PRIVILEGE',
                { note: 'campaign_data scope missing — Campaign API tests will 403.' });
        }
    } else {
        logError(SEC, 'PRIVILEGES_FAILED', privs.body);
    }

    // ── P2 · List automation safety guard ────────────────────────────
    console.log('\n[P2] Checking lists for active send automation...');
    const lists = await api.get(SEC, '/contact_lists?limit=100');
    const TRIGGER_LIST_NAME = 'New Contacts, Card Received';
    const riskyLists = [];

    if (lists.ok) {
        const all = lists.body.lists || [];
        console.log(`     Found ${all.length} list(s).`);

        for (const l of all) {
            // Flag the dedicated trigger list by name
            if (l.name === TRIGGER_LIST_NAME) {
                riskyLists.push(l);
                logError(SEC, 'AUTOMATION_TRIGGER_LIST_DETECTED', {
                    list_id: l.list_id, name: l.name,
                    note: 'This list had welcome-email automation attached in prior testing. ' +
                        'Do NOT import contacts into it during bulk tests or emails will fire.'
                });
                console.warn(`  🔴 AUTOMATION RISK: list "${l.name}" (${l.list_id})`);
                console.warn(`     → Do NOT use this list as a bulk import target.`);
            } else {
                console.log(`     ✅ Safe: "${l.name}" (${l.list_id})`);
            }
        }

        // Expose safe list IDs for the test runner
        const safeLists = all.filter(l => l.name !== TRIGGER_LIST_NAME);
        logNotice(SEC, 'SAFE_LISTS', {
            safe_list_count: safeLists.length,
            risky_lists: riskyLists.map(l => l.list_id)
        });

        console.log('\n[P2] VERDICT: The "New Contacts, Card Received" list MUST NOT receive');
        console.log('     bulk imports. All subsequent tests will use a dedicated stress-test list.');
    } else {
        logError(SEC, 'LIST_FETCH_FAILED', lists.body);
        console.warn('  ⚠️  Could not fetch contact lists.');
    }

    console.log('\n✅ Preflight complete.\n');
    return { summary: summary.body, counts: counts.body, privs: privs.body };
}

module.exports = { run };
