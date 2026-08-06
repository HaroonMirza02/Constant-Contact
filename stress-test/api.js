
'use strict';

/**
 * Thin wrapper around api-client.js that captures every call
 * into the JSONL log and returns { status, body, durationMs }.
 */
const rawClient = require('../api-client');
const { logRequest, logResponse, logError } = require('./logger');

async function call(section, method, url, body, headers) {
    const t0 = Date.now();
    logRequest(section, method.toUpperCase(), url, body);
    try {
        let res;
        const m = method.toLowerCase();
        const config = headers ? { headers } : undefined;
        if (m === 'get') res = await rawClient.get(url, config);
        else if (m === 'post') res = await rawClient.post(url, body, config);
        else if (m === 'put') res = await rawClient.put(url, body, config);
        else if (m === 'delete') res = await rawClient.delete(url, config);
        else if (m === 'patch') res = await rawClient.patch(url, body, config);
        else throw new Error(`Unknown method: ${method}`);

        const durationMs = Date.now() - t0;
        logResponse(section, method.toUpperCase(), url, res.status, res.data, durationMs);
        return { ok: true, status: res.status, body: res.data, durationMs };
    } catch (err) {
        const durationMs = Date.now() - t0;
        const status = err.response ? err.response.status : 0;
        const errBody = err.response ? err.response.data : { message: err.message };
        logResponse(section, method.toUpperCase(), url, status, errBody, durationMs);
        return { ok: false, status, body: errBody, durationMs, message: err.message };
    }
}

const api = {
    get: (sec, url, headers) => call(sec, 'GET', url, null, headers),
    post: (sec, url, body, headers) => call(sec, 'POST', url, body, headers),
    put: (sec, url, body, headers) => call(sec, 'PUT', url, body, headers),
    delete: (sec, url, headers) => call(sec, 'DELETE', url, null, headers),
};

module.exports = api;
