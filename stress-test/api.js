
'use strict';

/**
 * Thin wrapper around api-client.js that captures every call
 * into the JSONL log and returns { status, body, durationMs }.
 */
const rawClient = require('../api-client');
const { logRequest, logResponse, logError } = require('./logger');

async function call(section, method, url, body) {
    const t0 = Date.now();
    logRequest(section, method.toUpperCase(), url, body);
    try {
        let res;
        const m = method.toLowerCase();
        if (m === 'get') res = await rawClient.get(url);
        else if (m === 'post') res = await rawClient.post(url, body);
        else if (m === 'put') res = await rawClient.put(url, body);
        else if (m === 'delete') res = await rawClient.delete(url);
        else if (m === 'patch') res = await rawClient.patch(url, body);
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
    get: (sec, url) => call(sec, 'GET', url),
    post: (sec, url, body) => call(sec, 'POST', url, body),
    put: (sec, url, body) => call(sec, 'PUT', url, body),
    delete: (sec, url) => call(sec, 'DELETE', url),
};

module.exports = api;
