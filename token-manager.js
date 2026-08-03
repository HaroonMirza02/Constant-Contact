const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TOKENS_FILE = path.join(__dirname, 'tokens.json');

/**
 * Load tokens from tokens.json
 * @returns {object|null} The token object or null if not found
 */
function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading tokens from file:', error.message);
  }
  return null;
}

/**
 * Save tokens to tokens.json
 * @param {object} tokenData The token response from Constant Contact OAuth
 * @returns {object} The saved token data with computed expires_at
 */
function saveTokens(tokenData) {
  const updatedTokens = {
    ...tokenData,
    // Calculate expiration timestamp with 1 minute safety buffer (default expires_in is 86400 seconds)
    expires_at: Date.now() + (tokenData.expires_in - 60) * 1000
  };
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(updatedTokens, null, 2), 'utf8');
  console.log('[TokenManager] Tokens saved successfully to tokens.json:');
  console.log(`- Access Token: ${updatedTokens.access_token.substring(0, 10)}...`);
  console.log(`- Refresh Token: ${updatedTokens.refresh_token.substring(0, 10)}...`);
  console.log(`- Expires At: ${new Date(updatedTokens.expires_at).toISOString()}`);
  return updatedTokens;
}

/**
 * Check if the current tokens are expired or close to expiring
 * @returns {boolean} True if expired or not found, false otherwise
 */
function isTokenExpired() {
  const tokens = loadTokens();
  if (!tokens || !tokens.access_token || !tokens.expires_at) {
    return true;
  }
  return Date.now() >= tokens.expires_at;
}

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<object>} The new token data
 */
async function refreshAccessToken() {
  console.log('[TokenManager] Attempting to refresh access token...');
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token exists. Please authenticate first via /auth');
  }

  const clientId = process.env.CC_CLIENT_ID;
  const clientSecret = process.env.CC_CLIENT_SECRET;
  
  if (!clientId || !clientSecret || clientSecret === 'YOUR_CONSTANT_CONTACT_CLIENT_SECRET') {
    throw new Error('CC_CLIENT_ID or CC_CLIENT_SECRET is missing or not configured in .env');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  });

  const url = 'https://authz.constantcontact.com/oauth2/default/v1/token';
  
  console.log(`[TokenManager] Requesting POST ${url}`);
  console.log(`[TokenManager] Headers: Content-Type: application/x-www-form-urlencoded, Authorization: Basic [hidden]`);
  console.log(`[TokenManager] Body: grant_type=refresh_token&refresh_token=${tokens.refresh_token.substring(0, 10)}...`);

  try {
    const response = await axios.post(url, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      }
    });

    console.log('[TokenManager] Token refresh response status:', response.status);
    console.log('[TokenManager] Token refresh response body:', JSON.stringify(response.data, null, 2));

    return saveTokens(response.data);
  } catch (error) {
    console.error('[TokenManager] Error refreshing token:');
    if (error.response) {
      console.error(`- Status: ${error.response.status}`);
      console.error('- Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('- Body:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`- Message: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a valid access token. Retrieves stored token if valid; refreshes if expired.
 * @returns {Promise<string>} The valid access token
 */
async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('No access token found. Please visit /auth to authorize the app.');
  }

  if (isTokenExpired()) {
    console.log('[TokenManager] Stored access token is expired or close to expiration. Refreshing...');
    const newTokens = await refreshAccessToken();
    return newTokens.access_token;
  }

  return tokens.access_token;
}

module.exports = {
  loadTokens,
  saveTokens,
  isTokenExpired,
  refreshAccessToken,
  getValidAccessToken,
  TOKENS_FILE
};
