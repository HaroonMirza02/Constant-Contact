
'use strict';

/**
 * TEST 6 — Workflow simulation (business card pipeline, no email send)
 * TEST 7 — Data synchronization (API → UI edit → re-import consistency)
 * TEST 8 — Security / scope audit
 * TEST 9 — Edge cases (unicode, long notes, formatting extremes)
 */

const api = require('./api');
const { generateContact } = require('./generators');
const { logNotice, logError } = require('./logger');

// ── TEST 6 ────────────────────────────────────────────────────────────
async function runT6(stressListId, customFieldId) {
    const SEC = 'T6_WORKFLOW';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T6  W O R K F L O W   S I M U L A T I O N');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Simulate business card JSON payload (Vision71 pipeline output)
    const card = {
        first_name: 'Pipeline', last_name: 'Test',
        email: `pipeline.test.${Date.now()}@stresstest.dev`,
        company_name: 'Aventure Aviation',
        job_title: 'VP Procurement',
        phone_numbers: [{ phone_number: '+14045559876', kind: 'work' }],
        lead_source: 'Business Card Scan'
    };
    logNotice(SEC, 'W1_CARD_PAYLOAD', card);
    console.log('[W1] Simulated card payload ready.');

    // Step 2: Duplicate check (Vision71 responsibility)
    console.log('[W2] Duplicate check (email search)...');
    const dupCheck = await api.get(SEC, `/contacts?email=${encodeURIComponent(card.email)}&include=list_memberships,custom_fields`);
    const existing = (dupCheck.body.contacts || [])[0] || null;
    logNotice(SEC, 'W2_DUPLICATE_CHECK', { found: !!existing, id: existing ? existing.contact_id : null });
    console.log(`  → Existing contact found: ${!!existing}`);

    // Step 3: Create or Update (CC responsibility)
    let contactId;
    if (existing) {
        contactId = existing.contact_id;
        logNotice(SEC, 'W3_BOUNDARY', { boundary: 'Vision71 calls PUT — CC stores update' });
    } else {
        console.log('[W3] Creating contact (POST)...');
        const createR = await api.post(SEC, '/contacts', {
            create_source: 'Account',
            email_address: { address: card.email, permission_to_send: 'implicit' },
            first_name: card.first_name, last_name: card.last_name,
            company_name: card.company_name, job_title: card.job_title,
            phone_numbers: card.phone_numbers,
            list_memberships: [stressListId],
            custom_fields: customFieldId ? [{ custom_field_id: customFieldId, value: card.lead_source }] : []
        });
        contactId = createR.ok ? createR.body.contact_id : null;
        logNotice(SEC, 'W3_CREATE', {
            status: createR.status, id: contactId,
            boundary: 'CC stores contact; Vision71 manages pipeline state'
        });
        console.log(`  → status: ${createR.status}, id: ${contactId}`);
    }

    if (!contactId) { logError(SEC, 'W3_FAILED', {}); return; }

    // Step 4: Attach a note (stored in CC, Vision71 provides content)
    console.log('[W4] Attaching note...');
    const noteR = await api.post(SEC, `/contacts/${contactId}/notes`, {
        content: `Card scanned at Aventure Aviation Trade Show. Reviewed by pipeline at ${new Date().toISOString()}. Reminder: follow up in 7 days.`
    });
    logNotice(SEC, 'W4_NOTE', {
        status: noteR.status, body: noteR.body,
        boundary: 'CC stores notes; Vision71 triggers note creation via API'
    });
    console.log(`  → note status: ${noteR.status}`);

    // Step 5: Reminder — this is OUTSIDE CC's scope
    logNotice(SEC, 'W5_REMINDER_BOUNDARY', {
        boundary: 'CC has no reminder/task API. Vision71 application must handle scheduling (cron job, internal DB). CC responsibility ends at note storage.',
        recommendation: 'Store follow-up date in Vision71 DB. CC webhook or polling is needed to detect if contact re-engages.'
    });
    console.log('[W5] Reminder scheduling → Vision71 responsibility. CC has no task/reminder API. ✅ Logged.');

    // Capture full CC responsibility map
    logNotice(SEC, 'CC_VS_VISION71_BOUNDARY_MAP', {
        cc_owns: [
            'Contact record storage (email, name, phone, company, job_title)',
            'Custom field values',
            'List memberships',
            'Notes (via /contacts/{id}/notes)',
            'Bulk import and deduplication by email',
            'Unsubscribe management'
        ],
        vision71_owns: [
            'OCR / business card parsing',
            'Review screen before submission',
            'Duplicate confirmation logic',
            'Reminder/task scheduling',
            'Pipeline state machine (pending → reviewed → sent)',
            'Internal audit log',
            'Re-engagement detection (polling CC activity or webhook)'
        ]
    });
}

// ── TEST 7 ────────────────────────────────────────────────────────────
async function runT7(stressListId) {
    const SEC = 'T7_SYNC';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T7  D A T A   S Y N C H R O N I Z A T I O N');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const c = generateContact();

    // Create baseline
    const cr = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name, last_name: c.last_name,
        company_name: c.company_name, job_title: 'Baseline Title',
        list_memberships: [stressListId]
    });
    const id = cr.ok ? cr.body.contact_id : null;
    if (!id) { logError(SEC, 'SYNC_CREATE_FAILED', {}); return; }
    logNotice(SEC, 'SYNC_BASELINE', { id, job_title: 'Baseline Title' });
    console.log(`[Sync] Baseline created: ${id}`);

    // Path A: API update
    await api.put(SEC, `/contacts/${id}`, {
        update_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name, last_name: c.last_name,
        job_title: 'Updated via API',
        list_memberships: [stressListId]
    });
    const afterApi = await api.get(SEC, `/contacts/${id}`);
    logNotice(SEC, 'SYNC_AFTER_API', { job_title: afterApi.ok ? afterApi.body.job_title : 'FETCH_FAILED' });
    console.log(`  After API update: ${afterApi.ok ? afterApi.body.job_title : 'ERR'}`);

    // Path B: Pretend UI edited to 'Updated via UI' — we simulate with another PUT
    await api.put(SEC, `/contacts/${id}`, {
        update_source: 'Account',
        email_address: { address: c.email, permission_to_send: 'implicit' },
        first_name: c.first_name, last_name: c.last_name,
        job_title: 'Updated via UI (simulated)',
        list_memberships: [stressListId]
    });
    const afterUi = await api.get(SEC, `/contacts/${id}`);
    logNotice(SEC, 'SYNC_AFTER_UI_SIM', { job_title: afterUi.ok ? afterUi.body.job_title : 'FETCH_FAILED' });
    console.log(`  After UI simulation: ${afterUi.ok ? afterUi.body.job_title : 'ERR'}`);

    // Path C: Re-import same email via bulk with DIFFERENT job_title
    const bulkPayload = {
        import_data: [{ email: c.email, first_name: c.first_name, last_name: c.last_name, job_title: 'Re-imported Title' }],
        lists: [stressListId]
    };
    const bulkR = await api.post(SEC, '/activities/contacts', bulkPayload);
    logNotice(SEC, 'SYNC_REIMPORT', { status: bulkR.status, activity_id: bulkR.ok ? bulkR.body.activity_id : null });
    console.log(`  Re-import bulk status: ${bulkR.status}`);

    // Final state check
    const finalR = await api.get(SEC, `/contacts/${id}`);
    logNotice(SEC, 'SYNC_FINAL_STATE', {
        id, job_title: finalR.ok ? finalR.body.job_title : 'FETCH_FAILED',
        updated_at: finalR.ok ? finalR.body.updated_at : null
    });
    console.log(`  Final job_title in DB: ${finalR.ok ? finalR.body.job_title : 'ERR'}`);
}

// ── TEST 8 ────────────────────────────────────────────────────────────
async function runT8() {
    const SEC = 'T8_SECURITY';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T8  S E C U R I T Y   &   A C C E S S');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Probe scopes through actual API responses
    const probes = [
        { label: 'Account summary', url: '/account/summary', method: 'GET' },
        { label: 'Account emails', url: '/account/emails', method: 'GET' },
        { label: 'User privileges', url: '/account/user/privileges', method: 'GET' },
        { label: 'Contact lists', url: '/contact_lists?limit=5', method: 'GET' },
        { label: 'Contacts read', url: '/contacts?limit=1', method: 'GET' },
        { label: 'Custom fields read', url: '/contact_custom_fields', method: 'GET' },
        { label: 'Campaign list', url: '/emails?limit=1', method: 'GET' },
        { label: 'Segment list', url: '/segments?limit=1', method: 'GET' },
        { label: 'Partner accounts (API)', url: '/partner/accounts', method: 'GET' },
    ];

    for (const p of probes) {
        const r = await api.get(SEC, p.url);
        const verdict = r.ok ? '✅ ACCESSIBLE' : (r.status === 403 ? '🔒 FORBIDDEN (scope missing)' : `⚠️  ${r.status}`);
        logNotice(SEC, 'SCOPE_PROBE', { label: p.label, url: p.url, status: r.status, verdict });
        console.log(`  ${verdict}  ${p.label} (${p.url})`);
    }

    logNotice(SEC, 'DATA_RESIDENCY_ANALYSIS', {
        store_in_CC: ['contact identity', 'email opt-in status', 'list membership', 'custom fields', 'notes'],
        store_in_vision71: ['internal pipeline state', 'review flags', 'reminder dates', 'raw OCR payload', 'audit trail', 'per-field access control'],
        reason: 'CC provides no field-level access control per API user. All fields are equally readable to any token with contact_data scope.'
    });
}

// ── TEST 9 ────────────────────────────────────────────────────────────
async function runT9(stressListId) {
    const SEC = 'T9_EDGE';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('T9  E D G E   C A S E S');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const ts = Date.now();

    // E1: Unicode name
    console.log('[Edge-1] Unicode characters in name...');
    const u1 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `unicode.${ts}@stress.test`, permission_to_send: 'implicit' },
        first_name: 'Ünïcödé', last_name: '日本語テスト',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'EDGE_UNICODE', { status: u1.status, body: u1.ok ? { id: u1.body.contact_id } : u1.body });
    console.log(`  → ${u1.status}`);

    // E2: Extremely long note
    console.log('[Edge-2] Extremely long note (10k chars)...');
    const longNote = 'A'.repeat(10000);
    const noteContact = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `longnote.${ts}@stress.test`, permission_to_send: 'implicit' },
        first_name: 'LongNote', last_name: 'Test',
        list_memberships: [stressListId]
    });
    if (noteContact.ok) {
        const nr = await api.post(SEC, `/contacts/${noteContact.body.contact_id}/notes`, { content: longNote });
        logNotice(SEC, 'EDGE_LONG_NOTE', { status: nr.status, note_length: longNote.length, body: nr.ok ? 'stored' : nr.body });
        console.log(`  → Note (10k chars) status: ${nr.status}`);

        // Try 65k chars
        const veryLongNote = 'B'.repeat(65000);
        const nr2 = await api.post(SEC, `/contacts/${noteContact.body.contact_id}/notes`, { content: veryLongNote });
        logNotice(SEC, 'EDGE_VERY_LONG_NOTE', { status: nr2.status, note_length: veryLongNote.length, body: nr2.ok ? 'stored' : nr2.body });
        console.log(`  → Note (65k chars) status: ${nr2.status}`);
    }

    // E3: International phone formats
    console.log('[Edge-3] International phone formats...');
    const phones = ['+92 300 1234567', '+44 20 7946 0958', '+81-3-1234-5678', '00971501234567'];
    for (const ph of phones) {
        const pr = await api.post(SEC, '/contacts', {
            create_source: 'Account',
            email_address: { address: `phone.${ph.replace(/\D/g, '')}.${ts}@stress.test`, permission_to_send: 'implicit' },
            first_name: 'Phone', last_name: 'Test',
            phone_numbers: [{ phone_number: ph, kind: 'work' }],
            list_memberships: [stressListId]
        });
        logNotice(SEC, 'EDGE_PHONE', { phone: ph, status: pr.status, accepted: pr.ok });
        console.log(`  → "${ph}" → ${pr.status}`);
    }

    // E4: Missing mandatory fields
    console.log('[Edge-4] POST with only empty strings...');
    const e4 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: '', permission_to_send: 'implicit' },
        first_name: '', last_name: '',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'EDGE_EMPTY_STRINGS', { status: e4.status, body: e4.body });
    console.log(`  → ${e4.status}`);

    // E5: Special characters in name fields
    console.log('[Edge-5] Special characters (SQL injection attempt)...');
    const e5 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `sqlinject.${ts}@stress.test`, permission_to_send: 'implicit' },
        first_name: "O'Brien; DROP TABLE contacts;--", last_name: '<script>alert(1)</script>',
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'EDGE_SPECIAL_CHARS', { status: e5.status, accepted: e5.ok, body: e5.ok ? { id: e5.body.contact_id } : e5.body });
    console.log(`  → ${e5.status} (stored: ${e5.ok})`);

    // E6: Very long company name
    console.log('[Edge-6] Company name at extreme length...');
    const e6 = await api.post(SEC, '/contacts', {
        create_source: 'Account',
        email_address: { address: `longcorp.${ts}@stress.test`, permission_to_send: 'implicit' },
        first_name: 'Corp', last_name: 'Test',
        company_name: 'A'.repeat(500),
        list_memberships: [stressListId]
    });
    logNotice(SEC, 'EDGE_LONG_COMPANY', { status: e6.status, body: e6.ok ? 'accepted' : e6.body });
    console.log(`  → ${e6.status}`);
}

module.exports = { runT6, runT7, runT8, runT9 };
