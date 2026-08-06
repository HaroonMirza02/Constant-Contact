
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { initLog, logNotice, logError } = require('./logger');
const preflight = require('./preflight');
const t1 = require('./t1-large-dataset');
const t2 = require('./t2-duplicates');
const t3 = require('./t3-lifecycle');
const t4 = require('./t4-lists');
const t5 = require('./t5-stress');
const { runT6, runT7, runT8, runT9 } = require('./t6-t9');
const { buildReport } = require('./report-generator');
const api = require('./api');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    initLog();
    const RUN_START = Date.now();

    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  AVENTURE AVIATION — CC V3 STRESS HARNESS ║');
    console.log(`║  Started: ${new Date().toISOString()}  ║`);
    console.log('╚═══════════════════════════════════════════╝\n');

    // ── PREFLIGHT ──────────────────────────────────────────────────────
    let preflightData;
    try {
        preflightData = await preflight.run();
    } catch (err) {
        logError('RUNNER', 'PREFLIGHT_FATAL', { message: err.message });
        console.error('\n🚨 Preflight failed. Cannot continue:', err.message);
        process.exit(1);
    }

    // ── Provision a dedicated stress-test list ─────────────────────────
    console.log('\n[Setup] Creating dedicated stress-test import list...');
    const stressListName = `Stress Test ${Date.now()}`;
    const slRes = await api.post('RUNNER', '/contact_lists', {
        name: stressListName, favorite: false,
        description: 'Dedicated list for stress testing. NO email automation attached.'
    });
    const stressListId = slRes.ok ? slRes.body.list_id : null;
    if (!stressListId) {
        logError('RUNNER', 'STRESS_LIST_CREATE_FAILED', slRes.body);
        console.error('🚨 Cannot create stress-test list. Aborting.');
        process.exit(1);
    }
    console.log(`  ✅ Stress list: "${stressListName}" (${stressListId})`);
    logNotice('RUNNER', 'STRESS_LIST_READY', { stressListId, stressListName });

    // ── Provision custom field for tests ──────────────────────────────
    let customFieldId = null;
    try {
        const cfRes = await api.get('RUNNER', '/contact_custom_fields');
        const fields = cfRes.ok ? (cfRes.body.custom_fields || []) : [];
        const existing = fields.find(f => f.label === 'Lead Source');
        if (existing) {
            customFieldId = existing.custom_field_id;
        } else {
            const cr = await api.post('RUNNER', '/contact_custom_fields', { label: 'Lead Source', type: 'string' });
            customFieldId = cr.ok ? cr.body.custom_field_id : null;
        }
        logNotice('RUNNER', 'CUSTOM_FIELD_READY', { customFieldId });
        console.log(`  ✅ Custom field: Lead Source (${customFieldId})`);
    } catch (err) {
        logError('RUNNER', 'CUSTOM_FIELD_SETUP_FAILED', { message: err.message });
    }

    // ── Run all tests ──────────────────────────────────────────────────
    const results = {};

    try {
        console.log('\n▶ Running Test 1: Large Dataset...');
        results.t1 = await t1.run(stressListId, customFieldId);
    } catch (err) {
        logError('RUNNER', 'T1_EXCEPTION', { message: err.message });
        console.error('  ❌ T1 exception:', err.message);
    }

    await sleep(1000);

    try {
        console.log('\n▶ Running Test 2: Duplicates...');
        results.t2 = await t2.run(stressListId);
    } catch (err) {
        logError('RUNNER', 'T2_EXCEPTION', { message: err.message });
        console.error('  ❌ T2 exception:', err.message);
    }

    await sleep(1000);

    try {
        console.log('\n▶ Running Test 3: Lifecycle...');
        results.t3 = await t3.run(stressListId, customFieldId);
    } catch (err) {
        logError('RUNNER', 'T3_EXCEPTION', { message: err.message });
        console.error('  ❌ T3 exception:', err.message);
    }

    await sleep(1000);

    try {
        console.log('\n▶ Running Test 4: Lists & Segmentation...');
        results.t4 = await t4.run();
    } catch (err) {
        logError('RUNNER', 'T4_EXCEPTION', { message: err.message });
        console.error('  ❌ T4 exception:', err.message);
    }

    await sleep(1000);

    try {
        console.log('\n▶ Running Test 5: API Stress...');
        results.t5 = await t5.run(stressListId);
    } catch (err) {
        logError('RUNNER', 'T5_EXCEPTION', { message: err.message });
        console.error('  ❌ T5 exception:', err.message);
    }

    await sleep(1000);

    try {
        console.log('\n▶ Running Test 6: Workflow Simulation...');
        await runT6(stressListId, customFieldId);
    } catch (err) {
        logError('RUNNER', 'T6_EXCEPTION', { message: err.message });
        console.error('  ❌ T6 exception:', err.message);
    }

    try {
        console.log('\n▶ Running Test 7: Data Sync...');
        await runT7(stressListId);
    } catch (err) {
        logError('RUNNER', 'T7_EXCEPTION', { message: err.message });
        console.error('  ❌ T7 exception:', err.message);
    }

    try {
        console.log('\n▶ Running Test 8: Security / Scope...');
        await runT8();
    } catch (err) {
        logError('RUNNER', 'T8_EXCEPTION', { message: err.message });
        console.error('  ❌ T8 exception:', err.message);
    }

    try {
        console.log('\n▶ Running Test 9: Edge Cases...');
        await runT9(stressListId);
    } catch (err) {
        logError('RUNNER', 'T9_EXCEPTION', { message: err.message });
        console.error('  ❌ T9 exception:', err.message);
    }

    // ── Build report ───────────────────────────────────────────────────
    const totalMs = Date.now() - RUN_START;
    logNotice('RUNNER', 'TEST_RUN_COMPLETE', { totalMs });
    console.log(`\n\n✅ All tests complete in ${(totalMs / 1000).toFixed(1)}s.`);
    console.log('📝 Building report...\n');
    buildReport();
    console.log('\nFiles produced:');
    console.log('  stress-test/stress-test-log.jsonl  (raw per-API-call log)');
    console.log('  stress-test/stress-report.md       (client-facing summary report)\n');
}

main().catch(err => {
    console.error('\n🚨 Fatal runner error:', err.message, err.stack);
    process.exit(1);
});
