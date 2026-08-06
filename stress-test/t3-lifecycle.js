
'use strict';

/**
 * TEST 3 — Contact lifecycle
 * Create → Read → Update → Delete, Bulk delete,
 * Merge/restore attempt (expect 404/not-found), Bulk update activity.
 */

const api = require('./api');
const { generateContact } = require('./generators');
const { logNotice, logError } = require('./logger');

const SEC = 'T3_LIFECYCLE';

async function run(stressListId, customFieldId) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T3  C O N T A C T   L I F E C Y C L E');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const c = generateContact();

    // ── L1 · Create ───────────────────────────────────────────────────
    console.log('[L1] Create contact...');
    const createRes = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name, last_name: c.last_name,
        company_name: c.company_name, job_title: c.job_title,
        phone_numbers: c.phone_numbers,
        list_memberships: [stressListId],
        ...(customFieldId ? { custom_fields: [{ custom_field_id: customFieldId, value: c.lead_source }] } : {})
    });
    const id = createRes.ok ? createRes.body.contact_id : null;
    logNotice(SEC, 'L1_CREATE', { status: createRes.status, id });
    console.log(`  → status: ${createRes.status}, id: ${id}`);

    if (!id) { logError(SEC, 'L1_FAILED_CANNOT_PROCEED', {}); return; }

    // ── L2 · Read by ID ──────────────────────────────────────────────
    console.log('[L2] Read contact by ID...');
    const readRes = await api.get(SEC, `/contacts/${id}?include=custom_fields,list_memberships,phone_numbers,notes`);
    logNotice(SEC, 'L2_READ', { status: readRes.status, found: readRes.ok });
    console.log(`  → status: ${readRes.status}`);

    // ── L3 · Update (PUT) ────────────────────────────────────────────
    console.log('[L3] Update — change job_title and phone...');
    const updateRes = await api.put(SEC, `/contacts/${id}`, {
        update_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name, last_name: c.last_name,
        company_name: c.company_name,
        job_title: 'Chief Inspector (Updated)',
        phone_numbers: [{ phone_number: '+12025551234', kind: 'work' }],
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'L3_UPDATE', { status: updateRes.status });
    console.log(`  → status: ${updateRes.status}`);

    // ── L4 · Delete (single) ─────────────────────────────────────────
    console.log('[L4] Delete contact...');
    const delRes = await api.delete(SEC, `/contacts/${id}`);
    logNotice(SEC, 'L4_DELETE', { status: delRes.status, body: delRes.body });
    console.log(`  → status: ${delRes.status}`);

    // ── L5 · Read after delete (should 404) ──────────────────────────
    console.log('[L5] Attempt read after delete (expect 404)...');
    const afterDel = await api.get(SEC, `/contacts/${id}?include=custom_fields`);
    logNotice(SEC, 'L5_READ_AFTER_DELETE', {
        status: afterDel.status, body: afterDel.body,
        verdict: afterDel.status === 404 ? 'PROPERLY_404' : 'UNEXPECTED_' + afterDel.status
    });
    console.log(`  → status: ${afterDel.status} (expected 404)`);

    // ── L6 · Merge attempt (CC has no API merge endpoint) ────────────
    console.log('[L6] Merge endpoint probe (expect 404/405)...');
    const mergeRes = await api.post(SEC, '/contacts/merge', { contact_ids: [id] });
    logNotice(SEC, 'L6_MERGE', {
        status: mergeRes.status, body: mergeRes.body,
        verdict: 'No merge endpoint exists — confirmed by ' + mergeRes.status
    });
    console.log(`  → status: ${mergeRes.status}`);

    // ── L7 · Restore attempt (CC has no restore endpoint) ────────────
    console.log('[L7] Restore endpoint probe...');
    const restoreRes = await api.post(SEC, `/contacts/${id}/restore`, {});
    logNotice(SEC, 'L7_RESTORE', {
        status: restoreRes.status, body: restoreRes.body,
        verdict: 'No restore endpoint — confirmed by ' + restoreRes.status
    });
    console.log(`  → status: ${restoreRes.status}`);

    // ── L8 · Bulk delete via activity ────────────────────────────────
    console.log('[L8] Bulk delete via activity endpoint...');
    const toDelete = [];
    for (let i = 0; i < 3; i++) {
        const cx = generateContact();
        const r = await api.post(SEC, '/contacts', {
            create_source: 'Account',
            email_address: { address: cx.email, permission_to_send: 'implicit' },
            first_name: cx.first_name, last_name: cx.last_name,
            list_memberships: [stressListId]
        });
        if (r.ok) toDelete.push(r.body.contact_id);
    }
    console.log(`  Created ${toDelete.length} contacts for bulk delete.`);

    const bulkDelRes = await api.post(SEC, '/activities/contact_delete', {
        contact_ids: toDelete
    });
    logNotice(SEC, 'L8_BULK_DELETE', {
        status: bulkDelRes.status, activity_id: bulkDelRes.body.activity_id,
        contacts_submitted: toDelete.length
    });
    console.log(`  → bulk delete status: ${bulkDelRes.status}, activity_id: ${bulkDelRes.body.activity_id || 'none'}`);

    // ── L9 · Bulk update via activity (update list membership) ───────
    console.log('[L9] Bulk list membership update via activity...');
    const bulkUpdateRes = await api.post(SEC, '/activities/add_list_memberships', {
        source: { contact_ids: toDelete.filter(Boolean) },
        list_ids: [stressListId]
    });
    logNotice(SEC, 'L9_BULK_UPDATE', { status: bulkUpdateRes.status, body: bulkUpdateRes.body });
    console.log(`  → bulk update status: ${bulkUpdateRes.status}`);
}

module.exports = { run };
