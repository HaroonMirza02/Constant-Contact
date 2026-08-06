
'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'stress-test-log.jsonl');
const RPT_PATH = path.join(__dirname, 'stress-report.md');

// Append one JSON line per API event
function logEntry(section, event, data = {}) {
    const entry = { ts: new Date().toISOString(), section, event, ...data };
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    return entry;
}

function logRequest(section, method, url, body) {
    return logEntry(section, 'REQUEST', { method, url, body: body || null });
}

function logResponse(section, method, url, status, body, durationMs) {
    const ok = status >= 200 && status < 300;
    logEntry(section, ok ? 'RESPONSE_OK' : 'RESPONSE_ERR', { method, url, status, body, durationMs });
    return ok;
}

function logError(section, message, detail = {}) {
    return logEntry(section, 'ERROR', { message, ...detail });
}

function logNotice(section, message, detail = {}) {
    return logEntry(section, 'NOTICE', { message, ...detail });
}

function initLog() {
    if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
    logEntry('INIT', 'STRESS_TEST_START', { pid: process.pid });
}

function readLog() {
    if (!fs.existsSync(LOG_PATH)) return [];
    return fs.readFileSync(LOG_PATH, 'utf8')
        .split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
}

function writeReport(content) {
    fs.writeFileSync(RPT_PATH, content, 'utf8');
    console.log(`\n✅ Report written to: ${RPT_PATH}`);
}

module.exports = { logEntry, logRequest, logResponse, logError, logNotice, initLog, readLog, writeReport, LOG_PATH, RPT_PATH };
