const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runDuplicateTest() {
    console.log('\n======================================================');
    console.log('   Starting Aventure Aviation Duplicate Contact Test');
    console.log('======================================================\n');

    // Step 0: Pre-checks
    const tokensPath = path.join(__dirname, 'tokens.json');
    if (!fs.existsSync(tokensPath)) {
        console.error('❌ Error: tokens.json was not found.');
        console.error('Please run the Express server and log in via your browser first:');
        console.error(`👉 http://localhost:${PORT}/auth\n`);
        process.exit(1);
    }

    // Define a unique email address for this test run to ensure a clean start
    const timestamp = Date.now();
    const testEmail = `test.pilot.${timestamp}@aventureaviation.com`;

    const payload = {
        first_name: 'Test',
        last_name: 'Pilot',
        email: testEmail,
        company: 'Aventure Aviation Dev Labs',
        phone: '555-010-9999',
        lead_source: `CLI Test Run ${timestamp}`
    };

    console.log('🧪 Test Payload Ready:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');

    let firstContactId = null;

    // Run 1: First submission (expecting creation)
    try {
        console.log(`🚀 [RUN 1] Submitting payload for the first time...`);
        const res1 = await axios.post(`${BASE_URL}/api/contacts`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`✅ [RUN 1] Response received:`);
        console.log(`- Action performed: "${res1.data.action}"`);
        console.log(`- Contact ID:       ${res1.data.contact_id}`);
        if (res1.data.test_welcome_emails) {
            console.log(`- Welcome Emails:`);
            console.log(`  - List Trigger:  ${res1.data.test_welcome_emails.list_trigger.status} ("${res1.data.test_welcome_emails.list_trigger.list_name}")`);
            console.log(`  - Campaign API:  ${res1.data.test_welcome_emails.campaign_api.status} (Campaign ID: ${res1.data.test_welcome_emails.campaign_api.campaign_id || 'N/A'})`);
        }

        if (res1.data.action !== 'created') {
            console.warn(`⚠️ Warning: Expected action to be 'created' but got '${res1.data.action}'. (This could happen if the email already existed in Constant Contact).`);
        }

        firstContactId = res1.data.contact_id;
    } catch (error) {
        console.error('❌ [RUN 1] Request failed:');
        if (error.response) {
            console.error(`- Status: ${error.response.status}`);
            console.error('- Message:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`- Message: ${error.message}`);
        }
        console.error('\nEnsure your server is running ("npm start") and terminal logs show active connection.');
        process.exit(1);
    }

    console.log('\n------------------------------------------------------\n');

    // Run 2: Second submission (expecting merge/update instead of duplicate create)
    try {
        console.log(`🚀 [RUN 2] Submitting EXACT SAME payload a second time...`);
        const res2 = await axios.post(`${BASE_URL}/api/contacts`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`✅ [RUN 2] Response received:`);
        console.log(`- Action performed: "${res2.data.action}"`);
        console.log(`- Contact ID:       ${res2.data.contact_id}`);
        if (res2.data.test_welcome_emails) {
            console.log(`- Welcome Emails:`);
            console.log(`  - List Trigger:  ${res2.data.test_welcome_emails.list_trigger.status} ("${res2.data.test_welcome_emails.list_trigger.list_name}")`);
            console.log(`  - Campaign API:  ${res2.data.test_welcome_emails.campaign_api.status} (Campaign ID: ${res2.data.test_welcome_emails.campaign_api.campaign_id || 'N/A'})`);
        }

        // Validation assertions
        if (res2.data.action === 'updated') {
            console.log('🎉 Success: The pipeline responded with "updated" on the second run!');
        } else {
            console.error('❌ Failure: The pipeline should have responded with "updated" but instead returned: ' + res2.data.action);
        }

        if (res2.data.contact_id === firstContactId) {
            console.log('🎉 Success: The Contact ID matches the first run! No duplicate was created.');
        } else {
            console.error(`❌ Failure: Contact ID mismatch! First run: ${firstContactId}, Second run: ${res2.data.contact_id}`);
        }

    } catch (error) {
        console.error('❌ [RUN 2] Request failed:');
        if (error.response) {
            console.error(`- Status: ${error.response.status}`);
            console.error('- Message:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`- Message: ${error.message}`);
        }
        process.exit(1);
    }

    console.log('\n======================================================');
    console.log('             Test Execution Complete');
    console.log('======================================================\n');
}

runDuplicateTest();
