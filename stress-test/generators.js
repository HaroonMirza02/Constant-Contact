
'use strict';

const FIRST_NAMES = ['James', 'Maria', 'David', 'Sarah', 'Michael', 'Jennifer', 'Robert', 'Linda', 'William', 'Patricia',
    'Ahmed', 'Fatima', 'Omar', 'Aisha', 'Ali', 'Zainab', 'Hassan', 'Nour', 'Yusuf', 'Leila',
    'Carlos', 'Ana', 'Luis', 'Sofia', 'Juan', 'Isabel', 'Pedro', 'Carmen', 'Miguel', 'Elena',
    'Raj', 'Priya', 'Arun', 'Divya', 'Vijay', 'Sunita', 'Rohit', 'Kavya', 'Sanjay', 'Pooja'];

const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor',
    'Khan', 'Ahmed', 'Ali', 'Hassan', 'Sheikh', 'Malik', 'Qureshi', 'Raza', 'Siddiqui', 'Chaudhry',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Torres', 'Flores', 'Rivera',
    'Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Joshi', 'Shah', 'Mehta', 'Nair', 'Reddy'];

const COMPANIES = ['Aviall Services', 'StandardAero', 'Heico Corporation', 'TransDigm Group', 'AAR Corp',
    'Chromalloy Gas Turbine', 'Ducommun', 'Kaman Aerospace', 'Moog Inc', 'Parker Hannifin',
    'Global Air Lease', 'World Star Aviation', 'AerSale', 'Air Lease Corp', 'Atlas Air',
    'Duncan Aviation', 'Jet Aviation', 'Signature Flight', 'ExecuJet Aviation', 'Constant Aviation',
    'HAECO Americas', 'SR Technics', 'Lufthansa Technik', 'MRO Holdings', 'STS Aviation Services'];

const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'protonmail.com',
    'aviationco.com', 'aerotech.biz', 'flightops.net', 'mrogroup.com', 'aerosupply.io'];

const LEAD_SOURCES = ['Business Card Scan', 'Trade Show', 'Referral', 'LinkedIn Outreach',
    'Website Inquiry', 'Aviation Expo', 'Cold Outreach', 'Partner Referral', 'Conference', 'OCR Pipeline'];

let _seq = 0;

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateContact(overrides = {}) {
    _seq++;
    const seq = _seq;
    const first = rand(FIRST_NAMES);
    const last = rand(LAST_NAMES);
    const domain = rand(DOMAINS);
    const ts = Date.now();
    const email = `${first.toLowerCase()}.${last.toLowerCase()}.${seq}@${domain}`;
    const phone = `+1${randInt(200, 999)}${randInt(100, 999)}${randInt(1000, 9999)}`;

    return {
        first_name: first,
        last_name: last,
        email,
        company_name: rand(COMPANIES),
        phone_numbers: [{ phone_number: phone, kind: 'work' }],
        job_title: rand(['VP Sales', 'Director Ops', 'Procurement Manager', 'A&P Technician',
            'Chief Inspector', 'Fleet Manager', 'MRO Coordinator', 'Account Executive']),
        lead_source: rand(LEAD_SOURCES),
        ...overrides
    };
}

function generateBatch(size, overrides = {}) {
    const out = [];
    for (let i = 0; i < size; i++) out.push(generateContact(overrides));
    return out;
}

module.exports = { generateContact, generateBatch, rand };
