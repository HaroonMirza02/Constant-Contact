# Constant Contact V3 API Test Harness

This project serves as the foundational integration harness for the Aventure Aviation contact pipeline. It proves out oauth authentication, lookup search, custom field creation, and safe updates (upsert) against the Constant Contact V3 API.

---

## Technical Features Demonstrated

1. **OAuth 2.0 Authorization Code Flow**: Authenticates against Constant Contact API with `contact_data` and `offline_access` scopes, storing tokens locally in `tokens.json`.
2. **Auto refresh**: Automatically uses the refresh token to update credentials prior to api requests if they are close to expiration.
3. **Safe Upsert Routine**: 
   - Searches for contacts by email.
   - If missing, creates a new contact (`POST`).
   - If present, fetches the full existing details first to perform a safe merge and updates via `PUT` to prevent blanking out existing contact fields.
4. **Dynamic Custom Field Creation**: Resolves custom field IDs at runtime (e.g. for `Lead Source`), creating the field if it doesn't already exist.
5. **List Membership Enrollment**: Assigns contacts automatically to a specific list by name (or fallback to the first active list).
6. **Detailed Mapping Logs**: Full request and response interceptors logging headers, endpoints, and bodies.
7. **Duplicate Verification**: CLI automation testing run of matching payloads back-to-back to verify update behavior.

---

## Scope Checklist

- [x] OAuth 2.0 flow with access and refresh token persistence (`tokens.json`).
- [x] Endpoint accepting first name, last name, email, company, phone, and lead source.
- [x] Safe update routine (fetch -> merge -> PUT) rather than duplicate create.
- [x] Dynamic custom field (e.g. `Lead Source`) creation/matching.
- [x] List membership linking (targeting list `General Interest` or falling back).
- [x] Outgoing request and incoming response detail logging.
- [x] Duplicate CLI script test verifying back-to-back POST result transitions from `created` to `updated` with matching UUIDs.

---

## Setup & installation

### 1. Prerequisites
- install [Node.js](https://nodejs.org/) (v16+ recommended).
- A Constant Contact Developer portal account containing a registered App.

### 2. Install Project Dependencies
Run the command below in the project directory:
```bash
npm install
```

### 3. Local Environment Configuration
Create a `.env` file from the template or update `.env` directly using:
```ini
# Server Settings
PORT=3000

# Constant Contact V3 API Credentials
CC_CLIENT_ID=a79f06bd-6984-48bc-8d55-b0b4b7fd003e
CC_CLIENT_SECRET=YOUR_CONSTANT_CONTACT_CLIENT_SECRET
CC_REDIRECT_URI=http://localhost:3000/auth/callback

# Optional List and Custom Field Details
CC_LIST_NAME=General Interest
CC_CUSTOM_FIELD_LABEL=Lead Source
```

*Note: In the Constant Contact Developer Portal where your application is registered:*
1. Set the **Redirect URI** to match `CC_REDIRECT_URI` (e.g., `http://localhost:3000/auth/callback`).
2. Generate your **Client Secret** and copy it into the `CC_CLIENT_SECRET` variable above.

---

## Running the OAuth Link Flow

To perform initial authentication:

1. **Start the Express server**:
   ```bash
   npm start
   ```
2. **Access the Web Dashboard**:
   Open `http://localhost:3000` in your web browser. You'll see a premium dashboard showing "Connection Status: Not Authenticated".
3. **Execute Linkage**:
   Click **"Link Constant Contact Account"**. You will review scopes in Constant Contact's Portal and click "Allow".
4. **Link Complete**:
   The callback page will store tokens inside `tokens.json`. You will be navigated back to the dashboard, displaying "Connection Status: Authenticated" showing expiration buffers and a manual form to simulate inputs locally.

---

## Running the Duplicate CLI test

With the server running and tokens successfully linked:

1. Run the test script in a separate terminal:
   ```bash
   npm run test-flow
   ```

### What a Successful Run Looks Like
1. The script generates a new unique email address (`test.pilot.TIMESTAMP@aventureaviation.com`).
2. **Run 1: Submission**: Checks email, finds no match, checks / registers the "Lead Source" custom field if missing, finds the list ID to register the user, and sends a `POST` request.
   - Logs the full endpoint request details, payload body, and response.
   - Console logs `Action performed: "created"`.
3. **Run 2: Submission**: Sends the exact same payload a second time. Matches the email address, retrieves the contact by ID, merges fields including lead source custom values, matches list membership, and runs a `PUT` request.
   - Logs the full PUT request payload and response body.
   - Console logs `Action performed: "updated"`.
   - Asserts that the second run returned `"updated"` and that the returned `Contact ID` is identical to the first.

---

## File Structure

```
constant-contact-harness/
├── .env.example          # Template configuration
├── .env                  # Configuration variables (Client ID, Secrets, etc)
├── package.json          # Dependency allocations
├── token-manager.js      # OAuth tokens persistence & auto refresh
├── api-client.js         # Custom logged HTTP client for endpoint details
├── contact-service.js    # Lead search, merge, list binding and upsert routines
├── server.js             # User Auth routes and local dashboard portal
└── test-flow.js          # CLI automation script verifying upserts
```
