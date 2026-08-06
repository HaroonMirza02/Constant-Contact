const axios = require('axios');
const tokenManager = require('./token-manager');

// Base URL for Constant Contact V3 API
const BASE_URL = 'https://api.cc.email/v3';

/**
 * Log the Axios request in a clean, comprehensive format
 * @param {object} config Axios request config
 */
function logRequest(config) {
    console.log('\n--- [API REQUEST] ---');
    console.log(`Method: ${config.method.toUpperCase()}`);
    console.log(`URL:    ${config.url}`);

    // Format headers, obfuscating authorization token
    const headers = { ...config.headers };
    if (headers.Authorization && typeof headers.Authorization === 'string') {
        headers.Authorization = headers.Authorization.slice(0, 15) + '... [OBFUSCATED]';
    }
    console.log('Headers:', JSON.stringify(headers, null, 2));

    if (config.data) {
        console.log('Body:', typeof config.data === 'string' ? config.data : JSON.stringify(config.data, null, 2));
    } else {
        console.log('Body:   [Empty]');
    }
    console.log('---------------------\n');
}

/**
 * Log the Axios response in a clean, comprehensive format
 * @param {object} response Axios response
 */
function logResponse(response) {
    console.log('\n--- [API RESPONSE] ---');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`URL:    ${response.config.url}`);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Body:', JSON.stringify(response.data, null, 2));
    console.log('----------------------\n');
}

/**
 * Log Axios error in a clean, comprehensive format
 * @param {object} error Axios error
 */
function logError(error) {
    console.error('\n--- [API ERROR] ---');
    if (error.response) {
        console.error(`Status: ${error.response.status} ${error.response.statusText}`);
        console.error(`URL:    ${error.config.url}`);
        console.error('Request Headers:', JSON.stringify(error.config.headers, null, 2));
        if (error.config.data) {
            console.error('Request Body:', error.config.data);
        }
        console.error('Response Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('Response Body:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
        console.error('No response received for request:', error.request);
    } else {
        console.error('Request Setup Error:', error.message);
    }
    console.error('-------------------\n');
}

/**
 * Create a configured Axios instance
 */
const apiClient = axios.create({
    baseURL: BASE_URL,
});

// Request interceptor to add Authorization token and log the request
apiClient.interceptors.request.use(
    async (config) => {
        try {
            if (!config.headers['Authorization']) {
                const token = await tokenManager.getValidAccessToken();
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            config.headers['Content-Type'] = 'application/json';

            logRequest(config);
            return config;
        } catch (error) {
            console.error('[apiClient Interceptor] Error setting access token:', error.message);
            return Promise.reject(error);
        }
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to log response
apiClient.interceptors.response.use(
    (response) => {
        logResponse(response);
        return response;
    },
    (error) => {
        logError(error);
        return Promise.reject(error);
    }
);

module.exports = apiClient;
