
'use strict';

/**
 * TEST 4 — Lists and segmentation
 * Create lists, custom fields, multi-list membership,
 * move between lists, bulk segment action.
 * NO email automation is attached to any test list.
 */

const api = require('./api');
const { generateContact } = require('./generators');
const { logNotice, logError } = require('./logger');

const SEC = 'T4_LISTS';

async function run() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T4  L I S T S   &   S E G M E N T A T I O N');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const ts = Date.now();
    const createdListIds = [];
    const createdFieldIds = [];

    // ── S1 · Create three test lists ─────────────────────────────────
    const listNames = ['Stress Alpha', 'Stress Beta', 'Stress Gamma'];
    for (const name of listNames) {
        console.log(`[S1] Create list "${name}"...`);
        const r = await api.post(SEC, '/contact_lists', { name: `${name} ${ts}`, favorite: false });
        logNotice(SEC, 'S1_LIST_CREATE', { name, status: r.status, id: r.ok ? r.body.list_id : null });
        if (r.ok) createdListIds.push({ id: r.body.list_id, name: `${name} ${ts}` });
        console.log(`  → status: ${r.status}, id: ${r.ok ? r.body.list_id : 'ERR'}`);
    }

    if (createdListIds.length < 2) {
        logError(SEC, 'NOT_ENOUGH_LISTS', {}); return;
    }

    // ── S2 · Create two custom fields ────────────────────────────────
    const fieldLabels = [`Stress Field A ${ts}`, `Stress Field B ${ts}`];
    for (const label of fieldLabels) {
        const r = await api.post(SEC, '/contact_custom_fields', { label, type: 'string' });
        logNotice(SEC, 'S2_FIELD_CREATE', { label, status: r.status, id: r.ok ? r.body.custom_field_id : null });
        if (r.ok) createdFieldIds.push(r.body.custom_field_id);
        console.log(`[S2] Field "${label}" → ${r.status}`);
    }

    // ── S3 · Create contact in multiple lists simultaneously ──────────
    console.log('[S3] Create contact in two lists simultaneously...');
    const c3 = generateContact();
    const r3 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: c3.email, permission_to_send: 'implicit' },
        first_name: c3.first_name, last_name: c3.last_name, company_name: c3.company_name,
        list_memberships: createdListIds.slice(0, 2).map(l => l.id),
        custom_fields: createdFieldIds.length > 0
            ? [{ custom_field_id: createdFieldIds[0], value: 'TagAlpha' }] : []
    });
    const c3id = r3.ok ? r3.body.contact_id : null;
    const actualLists = r3.ok ? (r3.body.list_memberships || []) : [];
    logNotice(SEC, 'S3_MULTI_LIST', { status: r3.status, id: c3id, lists_in_response: actualLists });
    console.log(`  → status: ${r3.status}, lists in response: ${actualLists.length}`);

    // ── S4 · Confirm contact is in both lists ─────────────────────────
    if (c3id) {
        console.log('[S4] Verify multi-list membership...');
        const getR = await api.get(SEC, `/contacts/${c3id}?include=list_memberships`);
        const memberOf = getR.ok ? (getR.body.list_memberships || []) : [];
        logNotice(SEC, 'S4_MULTI_LIST_VERIFY', {
            id: c3id, member_of: memberOf,
            verdict: memberOf.length >= 2 ? 'CONFIRMED_MULTI_LIST' : 'ONLY_IN_ONE_LIST'
        });
        console.log(`  → member of ${memberOf.length} list(s): ${JSON.stringify(memberOf)}`);
    }

    // ── S5 · Move contact from List A to List B (remove + add) ───────
    if (c3id && createdListIds.length >= 3) {
        console.log('[S5] Move contact from list A → list C (via PUT)...');
        const moveRes = await api.put(SEC, `/contacts/${c3id}`, {
            update_source: 'Account',
            email_address: { address: c3.email, permission_to_send: 'implicit' },
            first_name: c3.first_name, last_name: c3.last_name,
            list_memberships: [createdListIds[2].id]  // Replace with only list C
        });
        const afterMove = await api.get(SEC, `/contacts/${c3id}?include=list_memberships`);
        const afterLists = afterMove.ok ? (afterMove.body.list_memberships || []) : [];
        logNotice(SEC, 'S5_MOVE', {
            status: moveRes.status, after_lists: afterLists,
            verdict: afterLists.length === 1 && afterLists[0] === createdListIds[2].id ? 'MOVED_CLEANLY' : 'PARTIAL_OR_FAILED'
        });
        console.log(`  → move status: ${moveRes.status}, now in: ${JSON.stringify(afterLists)}`);
    }

    // ── S6 · Bulk add to new list via activity ────────────────────────
    if (c3id && createdListIds.length >= 1) {
        console.log('[S6] Bulk segment add via activity...');
        const segRes = await api.post(SEC, '/activities/add_list_memberships', {
            source: { contact_ids: [c3id] },
            list_ids: [createdListIds[0].id]
        });
        let segFinalState = 'UNKNOWN';
        if (segRes.ok && segRes.body.activity_id) {
            const { pollActivity } = require('./t1-large-dataset');
            console.log(`  Polling bulk list segment activity ${segRes.body.activity_id}...`);
            const pollS = await pollActivity(segRes.body.activity_id);
            segFinalState = pollS.body ? pollS.body.state : 'UNKNOWN';
        }
        logNotice(SEC, 'S6_BULK_SEGMENT', { status: segRes.status, body: segRes.body, final_state: segFinalState });
        console.log(`  → activity status: ${segRes.status}, final_state: ${segFinalState}`);
    }

    // ── S7 · List retrieval with membership count ─────────────────────
    console.log('[S7] GET /contact_lists?include_membership_count=active...');
    const listWithCount = await api.get(SEC, '/contact_lists?limit=100&include_membership_count=active');
    const counted = listWithCount.ok
        ? (listWithCount.body.lists || []).map(l => ({ name: l.name, count: l.membership_count }))
        : [];
    logNotice(SEC, 'S7_LIST_COUNTS', { counts: counted });
    console.log(`  → List counts: ${JSON.stringify(counted)}`);

    // ── S8 · Custom field read-back ───────────────────────────────────
    if (createdFieldIds.length > 0 && c3id) {
        console.log('[S8] Custom field read-back...');
        const cfGet = await api.get(SEC, `/contacts/${c3id}?include=custom_fields`);
        const cfs = cfGet.ok ? (cfGet.body.custom_fields || []) : [];
        logNotice(SEC, 'S8_CUSTOM_FIELD_READBACK', { found: cfs, verdict: cfs.length > 0 ? 'STORED' : 'NOT_PRESENT' });
        console.log(`  → Custom fields on contact: ${JSON.stringify(cfs)}`);
    }

    return { createdListIds, createdFieldIds };
}

module.exports = { run };
