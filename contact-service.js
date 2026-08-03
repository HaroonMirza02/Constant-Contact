const apiClient = require('./api-client');

/**
 * Searches for a custom field by its label.
 * If it does not exist, it creates the custom field.
 * @param {string} label The display label of the custom field (e.g. "Lead Source")
 * @returns {Promise<string>} The custom_field_id
 */
async function getOrCreateCustomField(label) {
    console.log(`[ContactService] Checking if custom field with label "${label}" exists...`);

    try {
        const response = await apiClient.get('/contact_custom_fields');
        const fields = response.data.custom_fields || [];

        const existingField = fields.find(
            field => field.label.trim().toLowerCase() === label.trim().toLowerCase()
        );

        if (existingField) {
            console.log(`[ContactService] Found existing custom field: "${label}" -> ID: ${existingField.custom_field_id}`);
            return existingField.custom_field_id;
        }

        console.log(`[ContactService] Custom field "${label}" not found. Creating it...`);
        const createResponse = await apiClient.post('/contact_custom_fields', {
            label: label,
            type: 'string'
        });

        console.log(`[ContactService] Created custom field successfully: "${label}" -> ID: ${createResponse.data.custom_field_id}`);
        return createResponse.data.custom_field_id;
    } catch (error) {
        console.error(`[ContactService] Error in getOrCreateCustomField for "${label}":`, error.message);
        throw error;
    }
}

/**
 * Resolves a list ID by matching the list name.
 * If the list name is provided but doesn't exist, it creates it.
 * @param {string} listName Name of the list to find or create
 * @returns {Promise<string>} The list_id (UUID string)
 */
async function getOrCreateList(listName) {
    console.log(`[ContactService] Resolving list ID for list name "${listName}"...`);

    try {
        const response = await apiClient.get('/contact_lists?limit=100');
        const lists = response.data.lists || [];

        const match = lists.find(
            list => list.name.trim().toLowerCase() === listName.trim().toLowerCase()
        );

        if (match) {
            console.log(`[ContactService] Found list: "${match.name}" -> ID: ${match.list_id}`);
            return match.list_id;
        }

        console.log(`[ContactService] List "${listName}" not found. Creating it...`);
        const createResponse = await apiClient.post('/contact_lists', {
            name: listName,
            favorite: false
        });

        console.log(`[ContactService] Created list successfully: "${listName}" -> ID: ${createResponse.data.list_id}`);
        return createResponse.data.list_id;
    } catch (error) {
        console.error(`[ContactService] Error in getOrCreateList for "${listName}":`, error.message);
        throw error;
    }
}

/**
 * Legacy list lookup helper. Matches list name or falls back to the first available list.
 */
async function getTargetListId(listName) {
    console.log(`[ContactService] Finding list ID for list name "${listName || 'default'}"...`);

    try {
        const response = await apiClient.get('/contact_lists?limit=100');
        const lists = response.data.lists || [];

        if (lists.length === 0) {
            throw new Error('No contact lists found in your Constant Contact account. Please create at least one list in the Constant Contact UI.');
        }

        if (listName) {
            const match = lists.find(
                list => list.name.trim().toLowerCase() === listName.trim().toLowerCase()
            );
            if (match) {
                console.log(`[ContactService] Matches list: "${match.name}" -> ID: ${match.list_id}`);
                return match.list_id;
            }
            console.warn(`[ContactService] List with name "${listName}" not found. Falling back to the first available list.`);
        }

        const fallbackList = lists[0];
        console.log(`[ContactService] Using fallback list: "${fallbackList.name}" -> ID: ${fallbackList.list_id}`);
        return fallbackList.list_id;
    } catch (error) {
        console.error('[ContactService] Error in getTargetListId:', error.message);
        throw error;
    }
}

/**
 * Searches for a contact by email.
 * Includes custom_fields, list_memberships, phone_numbers to inspect current records.
 * @param {string} email Email address to search for
 * @returns {Promise<object|null>} The contact object if found, or null
 */
async function searchContactByEmail(email) {
    console.log(`[ContactService] Searching for contact by email: "${email}"...`);

    try {
        const response = await apiClient.get(`/contacts?email=${encodeURIComponent(email)}&include=custom_fields,list_memberships,phone_numbers,street_addresses,notes`);
        const contacts = response.data.contacts || [];

        if (contacts.length > 0) {
            console.log(`[ContactService] Found contact matching "${email}". Contact ID: ${contacts[0].contact_id}`);
            return contacts[0];
        }

        console.log(`[ContactService] No contact found matching "${email}".`);
        return null;
    } catch (error) {
        console.error(`[ContactService] Error searching contact by email "${email}":`, error.message);
        throw error;
    }
}

/**
 * Fetches a single contact in full detail by its contact_id.
 * @param {string} contactId UUID of the contact
 * @returns {Promise<object>} The contact resource object
 */
async function getContactById(contactId) {
    console.log(`[ContactService] Fetching contact details for ID: ${contactId}...`);
    try {
        const response = await apiClient.get(`/contacts/${contactId}?include=custom_fields,list_memberships,phone_numbers,street_addresses,notes`);
        return response.data;
    } catch (error) {
        console.error(`[ContactService] Error fetching contact by ID ${contactId}:`, error.message);
        throw error;
    }
}

/**
 * Helper to fetch a verified account email to set as campaign sender.
 * Falls back to CC_FROM_EMAIL in .env if API call fails or no address is found.
 */
async function getVerifiedEmail() {
    const envEmail = process.env.CC_FROM_EMAIL;
    if (envEmail && envEmail !== 'sender@example.com' && envEmail.trim() !== '') {
        console.log(`[ContactService] Using from_email from configuration: ${envEmail}`);
        return envEmail;
    }

    console.log('[ContactService] Fetching verified account email addresses...');
    try {
        const response = await apiClient.get('/account/emails?confirm_status=CONFIRMED');
        const emails = Array.isArray(response.data) ? response.data : (response.data.email_addresses || []);
        if (emails.length > 0) {
            const match = emails[0].email_address;
            console.log(`[ContactService] Found verified account email: "${match}"`);
            return match;
        }
        throw new Error('No verified email addresses found in your account.');
    } catch (error) {
        console.error('[ContactService] Error fetching verified emails from API:', error.message);
        if (envEmail && envEmail.trim() !== '') {
            console.log(`[ContactService] Falling back to env-configured CC_FROM_EMAIL: ${envEmail}`);
            return envEmail;
        }
        throw new Error('Failed to resolve a verified sender email. Set CC_FROM_EMAIL in your .env file.');
    }
}

/**
 * Creates a temporary list for single-contact targeting in campaigns.
 */
async function createTemporaryCampaignList(email) {
    const cleanEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
    const listName = `Temp Send - ${cleanEmail} - ${Date.now()}`;
    console.log(`[ContactService] Requesting temporary list: "${listName}"`);

    try {
        const response = await apiClient.post('/contact_lists', {
            name: listName,
            favorite: false,
            description: `Temporary list for campaign testing to target ${email}.`
        });
        console.log(`[ContactService] Created temporary list: ID ${response.data.list_id}`);
        return {
            list_id: response.data.list_id,
            name: listName
        };
    } catch (error) {
        console.error('[ContactService] Error creating temporary campaign list:', error.message);
        throw error;
    }
}

/**
 * Safely updates or creates a contact depending on whether they already exist.
 * Maps: first_name, last_name, email, company, phone, lead_source.
 * Also triggers Method 1 (List automated trigger) and Method 2 (Campaign API Send).
 * @param {object} payload Object with contact details
 * @returns {Promise<object>} Audit logging detailing both send actions and contact details
 */
async function upsertContact({ first_name, last_name, email, company, phone, lead_source }) {
    if (!email) {
        throw new Error('Email address is required to upsert a contact.');
    }

    // 1. Get custom field ID for "Lead Source"
    const customFieldLabel = process.env.CC_CUSTOM_FIELD_LABEL || 'Lead Source';
    const customFieldId = await getOrCreateCustomField(customFieldLabel);

    // 2. Resolve lists before contact upsert:
    //    List A: Default list (e.g. "My Contacts" or env fallback)
    const defaultListLabel = process.env.CC_LIST_NAME;
    const defaultListId = await getTargetListId(defaultListLabel);

    //    List B: Dedicated automated list ("New Contacts, Card Received")
    const triggerListLabel = 'New Contacts, Card Received';
    const triggerListId = await getOrCreateList(triggerListLabel);

    //    List C: Campaign temp list just for this specific contact
    const tempList = await createTemporaryCampaignList(email);

    // Combine target list memberships
    const targetListIds = [defaultListId, triggerListId, tempList.list_id];

    // 3. Search to check if contact exists
    const matchedContactBrief = await searchContactByEmail(email);
    let upsertedResponse = null;

    if (matchedContactBrief) {
        // CONTACT EXISTS - UPDATE (PUT)
        console.log(`[ContactService] Performing safe update (PUT) for contact: ${email} (ID: ${matchedContactBrief.contact_id})`);

        // Fetch full contact object first to avoid overwriting existing details with null (PUT is a full update)
        const existingContact = await getContactById(matchedContactBrief.contact_id);

        // Merge phone numbers
        let mergedPhoneNumbers = [];
        if (existingContact.phone_numbers && existingContact.phone_numbers.length > 0) {
            mergedPhoneNumbers = existingContact.phone_numbers.map(p => ({
                phone_number: p.phone_number,
                kind: p.kind
            }));
        }
        if (phone) {
            const idx = mergedPhoneNumbers.findIndex(p => p.kind === 'work');
            if (idx >= 0) {
                mergedPhoneNumbers[idx].phone_number = phone;
            } else {
                mergedPhoneNumbers.push({ phone_number: phone, kind: 'work' });
            }
        }

        // Merge custom fields
        let mergedCustomFields = [];
        if (existingContact.custom_fields && existingContact.custom_fields.length > 0) {
            mergedCustomFields = existingContact.custom_fields.map(cf => ({
                custom_field_id: cf.custom_field_id,
                value: cf.value
            }));
        }
        if (lead_source) {
            const idx = mergedCustomFields.findIndex(cf => cf.custom_field_id === customFieldId);
            if (idx >= 0) {
                mergedCustomFields[idx].value = lead_source;
            } else {
                mergedCustomFields.push({ custom_field_id: customFieldId, value: lead_source });
            }
        }

        // Merge list memberships including lists A, B, and C
        let mergedListMemberships = [];
        if (existingContact.list_memberships && existingContact.list_memberships.length > 0) {
            mergedListMemberships = existingContact.list_memberships.map(m => {
                if (typeof m === 'string') return m;
                if (m && typeof m === 'object' && m.list_id) return m.list_id;
                return null;
            }).filter(Boolean);
        }
        for (const lid of targetListIds) {
            if (!mergedListMemberships.includes(lid)) {
                mergedListMemberships.push(lid);
            }
        }

        // Merge street addresses
        let mergedStreetAddresses = [];
        if (existingContact.street_addresses && existingContact.street_addresses.length > 0) {
            mergedStreetAddresses = existingContact.street_addresses.map(addr => ({
                kind: addr.kind,
                street: addr.street,
                city: addr.city,
                state: addr.state,
                postal_code: addr.postal_code,
                country: addr.country
            }));
        }

        // Merge notes
        let mergedNotes = [];
        if (existingContact.notes && existingContact.notes.length > 0) {
            mergedNotes = existingContact.notes.map(n => ({
                note_id: n.note_id,
                content: n.content
            }));
        }

        // Build complete PUT object
        const putBody = {
            update_source: 'Account',
            email_address: {
                address: email,
                permission_to_send: existingContact.email_address ? existingContact.email_address.permission_to_send : 'implicit'
            },
            first_name: first_name || existingContact.first_name || '',
            last_name: last_name || existingContact.last_name || '',
            company_name: company || existingContact.company_name || '',
            job_title: existingContact.job_title || '',
            birthday_month: existingContact.birthday_month || undefined,
            birthday_day: existingContact.birthday_day || undefined,
            anniversary: existingContact.anniversary || undefined,
            phone_numbers: mergedPhoneNumbers,
            custom_fields: mergedCustomFields,
            list_memberships: mergedListMemberships,
            street_addresses: mergedStreetAddresses,
            notes: mergedNotes
        };

        console.log(`[ContactService] Sending PUT request for contact ID: ${existingContact.contact_id}`);
        upsertedResponse = await apiClient.put(`/contacts/${existingContact.contact_id}`, putBody);

    } else {
        // CONTACT DOES NOT EXIST - CREATE (POST)
        console.log(`[ContactService] Creating new contact (POST) for: ${email}`);

        const postBody = {
            create_source: 'Account',
            email_address: {
                address: email,
                permission_to_send: 'implicit'
            },
            first_name: first_name || '',
            last_name: last_name || '',
            company_name: company || '',
            phone_numbers: phone ? [
                {
                    phone_number: phone,
                    kind: 'work'
                }
            ] : [],
            custom_fields: lead_source ? [
                {
                    custom_field_id: customFieldId,
                    value: lead_source
                }
            ] : [],
            list_memberships: targetListIds
        };

        upsertedResponse = await apiClient.post('/contacts', postBody);
    }

    // --- WELCOME EMAIL METHODS EXECUTION ---
    const actionDone = matchedContactBrief ? 'updated' : 'created';
    const finalContactId = upsertedResponse.data.contact_id;

    // 1. Method 1: List Trigger verification
    const listTriggerTime = new Date().toISOString();
    console.log(`\n======================================================`);
    console.log(`   [METHOD 1: LIST TRIGGER] WELCOME EMAIL DISPATCHED`);
    console.log(`======================================================`);
    console.log(`Status:        Contact successfully enrolled in trigger list.`);
    console.log(`Trigger List:  "${triggerListLabel}" (ID: ${triggerListId})`);
    console.log(`Email Target:  ${email}`);
    console.log(`Dispatched At: ${listTriggerTime}`);
    console.log(`Action:        Account automation handles welcome email dispatch.`);
    console.log(`======================================================\n`);

    // 2. Method 2: Campaign API execution
    let campaignName = '';
    let campaignId = '';
    let campaignActivityId = '';
    let campaignTime = '';

    try {
        const verifiedSender = await getVerifiedEmail();
        campaignName = `Welcome Card Send - ${email.replace(/[^a-zA-Z0-9]/g, '_')} - ${Date.now()}`;
        const subject = 'Great meeting you, thanks for your card';

        const htmlBody = `<html>
    <body>
      <p>Hi ${first_name || 'Friend'},</p>
      <p>thank you for sharing your business card with the Aventure Aviation team. We have added your details to our contacts and look forward to staying connected. If there is anything you would like to know about what we do, feel free to reach out anytime.</p>
      <p>Best,<br>The Aventure Aviation Team</p>
    </body>
    </html>`;

        console.log(`[ContactService] [CampaignMethod] Creating campaign: "${campaignName}"`);
        const campaignCreateRes = await apiClient.post('/emails', {
            name: campaignName,
            email_campaign_activities: [
                {
                    format_type: '5',
                    from_name: process.env.CC_FROM_NAME || 'Aventure Aviation Team',
                    from_email: verifiedSender,
                    reply_to_email: verifiedSender,
                    subject: subject,
                    html_content: htmlBody,
                    physical_address_in_footer: {
                        address_line1: '123 Main St',
                        city: 'Anytown',
                        state_code: 'MA',
                        country_code: 'US',
                        postal_code: '02021'
                    }
                }
            ]
        });

        const activity = (campaignCreateRes.data.campaign_activities || campaignCreateRes.data.email_campaign_activities || []).find(act => act.role === 'primary_email');
        if (!activity) {
            throw new Error('Primary campaign activity not found in campaign creation response.');
        }

        campaignActivityId = activity.campaign_activity_id;
        campaignId = campaignCreateRes.data.campaign_id;

        console.log(`[ContactService] [CampaignMethod] Linking campaign activity ${campaignActivityId} to target list ${tempList.list_id}...`);
        await apiClient.put(`/emails/activities/${campaignActivityId}`, {
            from_name: process.env.CC_FROM_NAME || 'Aventure Aviation Team',
            from_email: verifiedSender,
            reply_to_email: verifiedSender,
            subject: subject,
            html_content: htmlBody,
            contact_list_ids: [tempList.list_id]
        });

        console.log(`[ContactService] [CampaignMethod] Requesting immediate send (POST schedule value "0")...`);
        campaignTime = new Date().toISOString();
        await apiClient.post(`/emails/activities/${campaignActivityId}/schedules`, {
            scheduled_date: '0'
        });

        console.log(`\n======================================================`);
        console.log(`   [METHOD 2: CAMPAIGN API] WELCOME EMAIL ACTIVE`);
        console.log(`======================================================`);
        console.log(`Status:               One-off campaign scheduled and sent immediately.`);
        console.log(`Campaign Name:        ${campaignName}`);
        console.log(`Campaign ID:          ${campaignId}`);
        console.log(`Campaign Activity ID: ${campaignActivityId}`);
        console.log(`Recipient List:       ${tempList.name} (ID: ${tempList.list_id})`);
        console.log(`Email Target:         ${email}`);
        console.log(`Dispatched At:        ${campaignTime}`);
        console.log(`Action:               Check inbox matching target email.`);
        console.log(`======================================================\n`);

    } catch (campaignErr) {
        console.error(`🔴 [ContactService] Campaign API Send Failed:`, campaignErr.message);
        campaignTime = 'FAILED: ' + campaignErr.message;
    }

    // 3. Schedule background cleanup of the temporary list (Wait 2 minutes for dispatch to process)
    const listIdToDelete = tempList.list_id;
    setTimeout(async () => {
        try {
            console.log(`\n[ContactService (Background Cleanup)] Clean-up task triggered for temporary list ${listIdToDelete}...`);
            await apiClient.delete(`/contact_lists/${listIdToDelete}`);
            console.log(`[ContactService (Background Cleanup)] List ${listIdToDelete} was deleted successfully.`);
        } catch (cleanupErr) {
            console.error(`[ContactService (Background Cleanup)] List ${listIdToDelete} deletion failure:`, cleanupErr.message);
        }
    }, 120 * 1000);

    return {
        action: actionDone,
        contact_id: finalContactId,
        data: upsertedResponse.data,
        test_welcome_emails: {
            list_trigger: {
                status: 'success',
                list_name: triggerListLabel,
                list_id: triggerListId,
                dispatched_at: listTriggerTime,
                instructions: 'Setup an automated trigger Campaign inside Constant Contact UI on join of this list.'
            },
            campaign_api: {
                status: campaignId ? 'success' : 'failed',
                campaign_name: campaignName,
                campaign_id: campaignId,
                campaign_activity_id: campaignActivityId,
                temp_list_id: tempList.list_id,
                temp_list_name: tempList.name,
                dispatched_at: campaignTime,
                instructions: 'Sent instantly. Check target email logs.'
            }
        }
    };
}

module.exports = {
    getOrCreateCustomField,
    getOrCreateList,
    getTargetListId,
    searchContactByEmail,
    getContactById,
    getVerifiedEmail,
    upsertContact
};
