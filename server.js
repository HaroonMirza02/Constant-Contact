const express = require('express');
const tokenManager = require('./token-manager');
const contactService = require('./contact-service');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTML page styling helper for a premium, dark-mode look
function getTemplate(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Constant Contact V3 API</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #09090b;
          --panel: #18181b;
          --border: #27272a;
          --text: #f4f4f5;
          --text-muted: #a1a1aa;
          --primary: #6366f1;
          --primary-hover: #4f46e5;
          --success: #10b981;
          --warning: #f59e0b;
          --danger: #ef4444;
        }
        
        body {
          margin: 0;
          padding: 0;
          background-color: var(--bg);
          color: var(--text);
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        header {
          width: 100%;
          max-width: 900px;
          padding: 2rem 1rem 1rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-sizing: border-box;
        }

        h1 {
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          font-size: 0.9rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
        }

        main {
          width: 100%;
          max-width: 900px;
          padding: 0 1rem 3rem 1rem;
          box-sizing: border-box;
        }

        .card {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        .card-title {
          font-size: 1.2rem;
          font-weight: 600;
          margin-top: 0;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
          font-weight: 600;
        }

        .badge-success { background-color: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-danger { background-color: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

        .btn {
          display: inline-block;
          background-color: var(--primary);
          color: white;
          text-decoration: none;
          padding: 0.6rem 1.2rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.9rem;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }

        .btn:hover {
          background-color: var(--primary-hover);
          transform: translateY(-1px);
        }

        .btn-secondary {
          background-color: #27272a;
          border: 1px solid var(--border);
          color: var(--text);
        }

        .btn-secondary:hover {
          background-color: #3f3f46;
        }

        .btn-group {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 0.4rem;
          font-weight: 500;
        }

        input {
          width: 100%;
          background-color: #09090b;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.6rem;
          color: var(--text);
          font-family: inherit;
          box-sizing: border-box;
          transition: border-color 0.2s ease;
        }

        input:focus {
          outline: none;
          border-color: var(--primary);
        }

        pre {
          background-color: #09090b;
          border: 1px solid var(--border);
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          color: #e4e4e7;
          margin: 0;
        }

        .flex-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 600px) {
          .flex-row {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div>
          <h1>Constant Contact V3 API</h1>
          <div class="subtitle">Aventure Aviation Contact Pipeline Foundation</div>
        </div>
      </header>
      <main>
        ${content}
      </main>
    </body>
    </html>
  `;
}

// 1. Landing route showing auth status, config details, and mock entry form
app.get('/', (req, res) => {
  const tokens = tokenManager.loadTokens();
  const isExpired = tokenManager.isTokenExpired();

  let statusHtml = '';
  if (tokens && tokens.access_token) {
    statusHtml = `
      <div class="card">
        <div class="card-title">
          Connection Status: 
          <span class="badge badge-success">Authenticated</span>
          ${isExpired ? '<span class="badge badge-danger">Expired - Refresh Needed</span>' : '<span class="badge badge-success">Token Valid</span>'}
        </div>
        <p style="margin: 0 0 1rem 0; font-size: 0.95rem; color: var(--text-muted);">
          Your App is connected to the Constant Contact V3 API. Stored token properties:
        </p>
        <pre>${JSON.stringify({
      expires_at: tokens.expires_at ? new Date(tokens.expires_at).toLocaleString() : 'N/A',
      is_expired: isExpired,
      token_type: tokens.token_type,
      scope: tokens.scope
    }, null, 2)}</pre>
        <div class="btn-group">
          <a href="/auth" class="btn btn-secondary">Re-Authenticate</a>
          <form action="/auth/refresh" method="POST" style="margin: 0;">
            <button type="submit" class="btn">Force Refresh Token</button>
          </form>
        </div>
      </div>
    `;
  } else {
    statusHtml = `
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">
          Connection Status: 
          <span class="badge badge-danger">Not Authenticated</span>
        </div>
        <p style="margin-bottom: 1.5rem; font-size: 0.95rem; color: var(--text-muted);">
          Your local App is not linked to any Constant Contact account yet. You need to run the OAuth flow to obtain a valid access token and refresh token.
        </p>
        <a href="/auth" class="btn">Link Constant Contact Account</a>
      </div>
    `;
  }

  const formHtml = `
    <div class="card">
      <div class="card-title">Simulate Contact Submission</div>
      <p style="margin-bottom: 1.5rem; font-size: 0.95rem; color: var(--text-muted);">
        Submit a lead mock payload matching the schema the vision model pipeline will produce.
        This triggers the email lookup and performs a safe update (PUT) or create (POST).
      </p>
      <form action="/api/contacts" method="POST">
        <div class="flex-row">
          <div class="form-group">
            <label for="first_name">First Name</label>
            <input type="text" id="first_name" name="first_name" value="Alex" required>
          </div>
          <div class="form-group">
            <label for="last_name">Last Name</label>
            <input type="text" id="last_name" name="last_name" value="Mercer" required>
          </div>
        </div>
        
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" value="alex.mercer@aventureaviation.com" required>
        </div>
        
        <div class="form-group">
          <label for="company">Company</label>
          <input type="text" id="company" name="company" value="Aventure Aviation">
        </div>
        
        <div class="flex-row">
          <div class="form-group">
            <label for="phone">Phone Number</label>
            <input type="text" id="phone" name="phone" value="404-555-0199">
          </div>
          <div class="form-group">
            <label for="lead_source">Lead Source (Custom Field Value)</label>
            <input type="text" id="lead_source" name="lead_source" value="Aventure Aviation OCR Parsing" required>
          </div>
        </div>
        
        <button type="submit" class="btn" style="width: 100%; margin-top: 0.5rem;" ${(!tokens || !tokens.access_token) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          ${(!tokens || !tokens.access_token) ? 'Authenticate First' : 'Test Upsert Pipeline'}
        </button>
      </form>
    </div>
  `;

  const configHtml = `
    <div class="card">
      <div class="card-title">Active App Configuration</div>
      <pre>${JSON.stringify({
    PORT: PORT,
    CC_CLIENT_ID: process.env.CC_CLIENT_ID,
    CC_REDIRECT_URI: process.env.CC_REDIRECT_URI,
    CC_LIST_NAME: process.env.CC_LIST_NAME || '[Fallback: First Active List]',
    CC_CUSTOM_FIELD_LABEL: process.env.CC_CUSTOM_FIELD_LABEL || 'Lead Source'
  }, null, 2)}</pre>
    </div>
  `;

  res.send(getTemplate(statusHtml + formHtml + configHtml));
});

// 2. OAuth authentication initiation endpoint
app.get('/auth', (req, res) => {
  const clientId = process.env.CC_CLIENT_ID;
  const redirectUri = process.env.CC_REDIRECT_URI;

  if (!clientId) {
    return res.status(500).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Configuration Error</div>
        <p>CC_CLIENT_ID is not configured in your .env file.</p>
        <a href="/" class="btn btn-secondary">Back Home</a>
      </div>
    `));
  }

  // Define scopes: contact_data is needed to manage custom fields, lists, and contacts.
  // campaign_data is needed to run campaign email tests.
  // account_read is needed to fetch verified account email addresses.
  // offline_access is needed to get the refresh token.
  const scope = 'contact_data campaign_data account_read offline_access';
  const state = 'aventure-aviation-harness-random-state-123';

  const authUrl = `https://authz.constantcontact.com/oauth2/default/v1/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

  console.log(`[Server] Redirecting user to authorization URL: ${authUrl}`);
  res.redirect(authUrl);
});

// 3. OAuth Callback handler
app.get('/auth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error(`[Server] OAuth authorization failed: ${error} - ${error_description}`);
    return res.status(400).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Authorization Failed</div>
        <p style="color: var(--danger); font-weight: bold;">Error: ${error}</p>
        <p>${error_description}</p>
        <a href="/" class="btn btn-secondary">Try Again</a>
      </div>
    `));
  }

  if (!code) {
    return res.status(400).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Callback Error</div>
        <p>No authorization code received.</p>
        <a href="/" class="btn btn-secondary">Retry Auth</a>
      </div>
    `));
  }

  console.log('[Server] Authorization code received. Exchanging for tokens...');

  const clientId = process.env.CC_CLIENT_ID;
  const clientSecret = process.env.CC_CLIENT_SECRET;
  const redirectUri = process.env.CC_REDIRECT_URI;

  if (!clientId || !clientSecret || clientSecret === 'YOUR_CONSTANT_CONTACT_CLIENT_SECRET') {
    return res.status(500).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Configuration Missing</div>
        <p>Make sure you have set CC_CLIENT_SECRET and CC_CLIENT_ID in your local .env file.</p>
        <a href="/" class="btn btn-secondary">Back Home</a>
      </div>
    `));
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  });

  const url = 'https://authz.constantcontact.com/oauth2/default/v1/token';

  try {
    console.log(`[Server] Sending token request to: ${url}`);
    const response = await axios.post(url, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      }
    });

    console.log('[Server] Code exchange successful. Saving tokens...');
    tokenManager.saveTokens(response.data);

    res.send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="card-title">Authentication Successful!</div>
        <p style="color: var(--success); font-weight: bold;">App linked successfully.</p>
        <p>Access token and refresh token have been saved to <code>tokens.json</code>.</p>
        <br>
        <a href="/" class="btn">Return to Dashboard</a>
      </div>
    `));
  } catch (err) {
    console.error('[Server] Token exchange error:');
    let summary = err.message;
    if (err.response) {
      console.error(`- Status: ${err.response.status}`);
      console.error('- Body:', JSON.stringify(err.response.data, null, 2));
      summary = `Status ${err.response.status}: ${JSON.stringify(err.response.data)}`;
    }

    res.status(500).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Token Exchange Failed</div>
        <p>An error occurred exchange authorization code for tokens:</p>
        <pre>${summary}</pre>
        <br>
        <a href="/" class="btn btn-secondary">Return Home</a>
      </div>
    `));
  }
});

// 4. Force token refresh route
app.post('/auth/refresh', async (req, res) => {
  try {
    const newTokens = await tokenManager.refreshAccessToken();

    // Check if this was a browser form submit or API call
    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: true, tokens: newTokens });
    }

    res.send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="card-title">Token Refreshed Successfully!</div>
        <p>The tokens have been refreshed and updated in <code>tokens.json</code>.</p>
        <br>
        <a href="/" class="btn">Return to Dashboard</a>
      </div>
    `));
  } catch (error) {
    if (req.headers['content-type'] === 'application/json') {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(500).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">token Refresh Failed</div>
        <pre>${error.message}</pre>
        <br>
        <a href="/" class="btn btn-secondary">Return Home</a>
      </div>
    `));
  }
});

// 5. Contact Upsert endpoint (accepts URL-encoded form submissions from UI and JSON from API/test scripts)
app.post('/api/contacts', async (req, res) => {
  const isJson = req.headers['content-type'] === 'application/json';
  const payload = req.body;

  console.log('[Server] Received contact upsert request payload:', JSON.stringify(payload, null, 2));

  try {
    const result = await contactService.upsertContact(payload);

    if (isJson) {
      return res.json(result);
    }

    res.send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="card-title">Upsert Successful!</div>
        <p>Action performed: <strong style="text-transform: uppercase; color: var(--success);">${result.action}</strong></p>
        <p>Contact ID: <code>${result.contact_id}</code></p>
      </div>

      <div class="card">
        <div class="card-title">Welcome Email Verification Results</div>
        
        <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Method 1: List Trigger Flow</h4>
        <p style="font-size: 0.95rem; margin-top: 0; color: var(--text-muted);">
          Contact auto-added to trigger list <strong>"${result.test_welcome_emails.list_trigger.list_name}"</strong>.
        </p>
        <pre>${JSON.stringify(result.test_welcome_emails.list_trigger, null, 2)}</pre>
        
        <br>
        
        <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Method 2: Campaign API Flow</h4>
        <p style="font-size: 0.95rem; margin-top: 0; color: var(--text-muted);">
          One-off campaign <strong>"${result.test_welcome_emails.campaign_api.campaign_name || ''}"</strong> created, linked, and dispatched immediately (scheduled date "0").
        </p>
        <pre>${JSON.stringify(result.test_welcome_emails.campaign_api, null, 2)}</pre>
      </div>

      <div class="card">
        <div class="card-title">Contact API Response Details:</div>
        <pre>${JSON.stringify(result.data, null, 2)}</pre>
        <br>
        <a href="/" class="btn">Return to Dashboard</a>
      </div>
    `));
  } catch (error) {
    let errMsg = error.message;
    if (error.response && error.response.data) {
      errMsg = JSON.stringify(error.response.data, null, 2);
    }

    if (isJson) {
      return res.status(500).json({ success: false, error: errMsg });
    }

    res.status(500).send(getTemplate(`
      <div class="card" style="border-left: 4px solid var(--danger);">
        <div class="card-title">Upsert Failed</div>
        <p>An error occurred in the contact pipeline:</p>
        <pre>${errMsg}</pre>
        <br>
        <a href="/" class="btn btn-secondary">Return to Dashboard</a>
      </div>
    `));
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Constant Contact test app running at: http://localhost:${PORT}`);
  console.log(`Wait for OAuth link inside the UI to authenticate.`);
  console.log(`======================================================\n`);
});
