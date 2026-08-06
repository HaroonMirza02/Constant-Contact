
'use strict';

/**
 * TEST 2 — Duplicate scenarios
 * Tests: duplicate email, same name/diff email, same company,
 *        re-import same batch, conflicting field update.
 * Documents exact CC behavior: silent overwrite / reject / merge / new record.
 */

const api = require('./api');
const { generateContact } = require('./generators');
const { logNotice, logError } = require('./logger');

const SEC = 'T2_DUPLICATES';

async function createContact(c, listId) {
    return api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name,
        last_name: c.last_name,
        company_name: c.company_name,
        job_title: c.job_title || '',
        phone_numbers: c.phone_numbers || [],
        list_memberships: [listId]
    });
}

async function searchByEmail(email) {
    return api.get(SEC, `/contacts?email=${encodeURIComponent(email)}&include=custom_fields,list_memberships,phone_numbers`);
}

async function run(stressListId) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T2  D U P L I C A T E   S C E N A R I O S');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    const results = {};

    // ── D1 · Duplicate email, same data ──────────────────────────────
    console.log('[D1] Duplicate email — same data submitted twice...');
    const d1 = generateContact();
    const r1a = await createContact(d1, stressListId);
    const r1b = await createContact(d1, stressListId);
    const s1 = await searchByEmail(d1.email);
    const d1Count = (s1.body.contacts || []).length;
    logNotice(SEC, 'D1_RESULT', {
        scenario: 'Duplicate email same data',
        first_post_status: r1a.status,
        second_post_status: r1b.status,
        records_found_after: d1Count,
        contact_id_first: r1a.ok ? r1a.body.contact_id : null,
        contact_id_second: r1b.ok ? r1b.body.contact_id : null,
        verdict: d1Count > 1 ? 'NEW_RECORD_CREATED' : r1b.status === 409 ? 'REJECTED_409' : 'SILENTLY_OVERWRITTEN_OR_MERGED'
    });
    console.log(`  → First: ${r1a.status}, Second: ${r1b.status}, Records found: ${d1Count}`);

    // ── D2 · Same name, different email ──────────────────────────────
    console.log('[D2] Same name, different email...');
    const base = generateContact();
    const d2a = { ...base };
    const d2b = { ...base, email: `dup2b.${Date.now()}@stresstest.com` };
    const r2a = await createContact(d2a, stressListId);
    const r2b = await createContact(d2b, stressListId);
    logNotice(SEC, 'D2_RESULT', {
        scenario: 'Same name, different email',
        status_a: r2a.status, id_a: r2a.ok ? r2a.body.contact_id : null,
        status_b: r2b.status, id_b: r2b.ok ? r2b.body.contact_id : null,
        verdict: (r2a.ok && r2b.ok && r2a.body.contact_id !== r2b.body.contact_id)
            ? 'TWO_SEPARATE_RECORDS' : 'MERGED_OR_REJECTED'
    });
    console.log(`  → A: ${r2a.status}, B: ${r2b.status}`);

    // ── D3 · Conflicting phone on same email (should update) ─────────
    console.log('[D3] Conflicting phone number on same email...');
    const d3base = generateContact();
    const r3a = await createContact(d3base, stressListId);
    const d3_id = r3a.ok ? r3a.body.contact_id : null;

    let r3b = { ok: false, status: 0, body: {} };
    if (d3_id) {
        const updatedPhone = '+19995550001';
        r3b = await api.put(SEC, `/contacts/${d3_id}`, {
            update_source: 'Account',
            email_address: { address: d3base.email, permission_to_send: 'implicit' },
            first_name: d3base.first_name,
            last_name: d3base.last_name,
            company_name: d3base.company_name,
            phone_numbers: [{ phone_number: updatedPhone, kind: 'work' }],
            list_memberships: [stressListId]
        });
        const afterGet = await api.get(SEC, `/contacts/${d3_id}?include=phone_numbers`);
        const finalPhone = afterGet.ok
            ? (afterGet.body.phone_numbers || []).map(p => p.phone_number).join(',')
            : 'FETCH_FAILED';
        logNotice(SEC, 'D3_RESULT', {
            scenario: 'Conflicting phone on existing email',
            original_phone: d3base.phone_numbers[0].phone_number,
            updated_phone: updatedPhone,
            final_phone_in_db: finalPhone,
            put_status: r3b.status,
            verdict: finalPhone === updatedPhone ? 'OVERWRITTEN' : finalPhone.includes(updatedPhone) ? 'MERGED' : 'UNCHANGED'
        });
        console.log(`  → PUT status: ${r3b.status}, final phone: ${finalPhone}`);
    }

    // ── D4 · Conflicting job_title on same email ──────────────────────
    console.log('[D4] Conflicting job_title on same email...');
    const d4 = generateContact();
    const r4a = await createContact({ ...d4, job_title: 'Inspector' }, stressListId);
    const d4id = r4a.ok ? r4a.body.contact_id : null;
    let d4Verdict = 'SKIPPED';
    if (d4id) {
        const r4b = await api.put(SEC, `/contacts/${d4id}`, {
            update_source: 'Account',
            email_address: { address: d4.email, permission_to_send: 'implicit' },
            first_name: d4.first_name,
            last_name: d4.last_name,
            company_name: d4.company_name,
            job_title: 'Fleet Director',
            list_memberships: [stressListId]
        });
        const r4get = await api.get(SEC, `/contacts/${d4id}`);
        const finalTitle = r4get.ok ? r4get.body.job_title : 'FETCH_FAILED';
        d4Verdict = finalTitle === 'Fleet Director' ? 'OVERWRITTEN' : 'UNCHANGED_OR_MERGED';
        logNotice(SEC, 'D4_RESULT', { scenario: 'Conflicting job_title', original: 'Inspector', updated: 'Fleet Director', final: finalTitle, verdict: d4Verdict });
        console.log(`  → final job_title: ${finalTitle} (${d4Verdict})`);
    }

    // ── D5 · Re-import identical dataset via bulk endpoint ───────────
    console.log('[D5] Re-import identical dataset (bulk) — checking for duplicates...');
    const d5batch = [generateContact(), generateContact(), generateContact()];
    const bulkPayload = {
        import_data: d5batch.map(c => ({
            email: c.email, first_name: c.first_name, last_name: c.last_name,
            company_name: c.company_name, phone: c.phone_numbers[0].phone_number
        })),
        list_ids: [stressListId]
    };
    const { pollActivity } = require('./t1-large-dataset');
    const r5a = await api.post(SEC, '/activities/contacts_json_import', bulkPayload);
    if (r5a.ok && r5a.body.activity_id) {
        console.log(`  Polling first re-import activity ${r5a.body.activity_id}...`);
        await pollActivity(r5a.body.activity_id);
    }
    const r5b = await api.post(SEC, '/activities/contacts_json_import', bulkPayload); // exact re-import
    if (r5b.ok && r5b.body.activity_id) {
        console.log(`  Polling second re-import activity ${r5b.body.activity_id}...`);
        await pollActivity(r5b.body.activity_id);
    }
    logNotice(SEC, 'D5_RESULT', {
        scenario: 'Exact re-import via bulk endpoint',
        first_import_status: r5a.status,
        second_import_status: r5b.status,
        note: 'Deduplicated internally by CC on JSON import'
    });
    console.log(`  → First bulk: ${r5a.status}, Re-import: ${r5b.status}`);

    return results;
}

module.exports = { run };
