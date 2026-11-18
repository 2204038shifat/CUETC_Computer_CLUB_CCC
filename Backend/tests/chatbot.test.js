'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const {
    createChatbotEngine,
    PUBLIC_CONTENT_FILTER,
    VERIFIED_CLUB_KNOWLEDGE,
    MAX_MESSAGE_LENGTH,
    classifyGeminiError,
    sanitizeHistory,
    detectIntent,
    redactSecrets
} = require('../services/chatbotEngine');

const chatbotModule = require('../routes/chatbot');
const { createChatbotRouter, createRateLimiter } = chatbotModule;

// ==================== TEST HELPERS ====================

function createMockQuery(docs) {
    return {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        lean() { return Promise.resolve(docs); }
    };
}

function createMockModels({ events = [], contests = [], news = [], failDb = false } = {}) {
    const filterCalls = { Event: [], Contest: [], News: [] };

    function filterPublic(list, query) {
        if (!query || !query.$or) return list;
        return list.filter(item => item.status === 'approved' || item.status === undefined);
    }

    function makeModel(name, data) {
        return {
            find(query) {
                filterCalls[name].push(query);
                if (failDb) {
                    return {
                        select() { return this; },
                        sort() { return this; },
                        limit() { return this; },
                        lean() { return Promise.reject(new Error('MongoNetworkError: connection refused')); }
                    };
                }
                return createMockQuery(filterPublic(data, query));
            }
        };
    }

    return {
        models: {
            Event: makeModel('Event', events),
            Contest: makeModel('Contest', contests),
            News: makeModel('News', news)
        },
        filterCalls
    };
}

const SAMPLE_EVENTS = [
    {
        title: 'Future AI Workshop',
        date: '2099-12-10',
        location: 'CUET Auditorium',
        description: 'Hands-on AI workshop',
        registrationFee: 0,
        status: 'approved'
    },
    {
        title: 'Sooner CP Meetup',
        date: '2099-11-25',
        location: 'CSE Lab',
        description: 'Competitive programming meetup',
        registrationFee: 100,
        status: 'approved'
    },
    {
        title: 'Legacy Approved Event',
        date: '2020-01-15',
        location: 'Old Hall',
        description: 'Past legacy event without status field',
        registrationFee: 0
    },
    {
        title: 'SECRET PENDING EVENT',
        date: '2099-12-01',
        location: 'Hidden Room',
        description: 'Must never be shown publicly',
        registrationFee: 0,
        status: 'pending'
    },
    {
        title: 'REJECTED INTERNAL EVENT',
        date: '2099-12-02',
        location: 'Hidden Room',
        description: 'Must never be shown publicly',
        registrationFee: 0,
        status: 'rejected'
    }
];

const SAMPLE_CONTESTS = [
    {
        title: 'CUET Inter-University Hackathon',
        date: '2099-12-20',
        prize: '50,000 BDT',
        teamSize: '1-3 members',
        registrationFee: 500,
        description: 'Build innovative software',
        status: 'approved'
    },
    {
        title: 'UNAPPROVED PENDING CONTEST',
        date: '2099-12-22',
        prize: '999,999 BDT',
        teamSize: '1-3 members',
        status: 'pending'
    }
];

const SAMPLE_NEWS = [
    {
        title: 'CUET Computer Club 2026 Roadmap',
        content: 'New workshops, bootcamps, and contests announced for all students.',
        author: 'Admin',
        status: 'approved'
    },
    {
        title: 'DRAFT PENDING NEWS',
        content: 'Internal draft not approved yet.',
        author: 'Rep',
        status: 'pending'
    }
];

async function withServer(app, fn) {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        return await fn(baseUrl);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

async function postJson(baseUrl, routePath, body, headers = {}) {
    const res = await fetch(`${baseUrl}${routePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    return { status: res.status, headers: res.headers, body: json };
}

function createSilentLogger(records = []) {
    return (level, payload) => records.push({ level, ...payload });
}

// ==================== 1. UNIT TESTS: HISTORY, ERRORS, SECRETS, CLUB KNOWLEDGE ====================

test('VERIFIED_CLUB_KNOWLEDGE excludes unverified contact placeholders and has corrected VP Admin role', () => {
    assert.ok(!VERIFIED_CLUB_KNOWLEDGE.includes('contact@computerclub.com'));
    assert.ok(!VERIFIED_CLUB_KNOWLEDGE.includes('Room 201'));
    assert.ok(!VERIFIED_CLUB_KNOWLEDGE.includes('+1 (234) 567-890'));
    assert.ok(VERIFIED_CLUB_KNOWLEDGE.includes('Towhidul Islam Rizvi: President'));
    assert.ok(VERIFIED_CLUB_KNOWLEDGE.includes('Md. Jamil Hossen Safi: Vice President (Admin)'));
});

test('sanitizeHistory handles missing, malformed, non-alternating, and oversized histories safely', () => {
    assert.deepEqual(sanitizeHistory(null), []);
    assert.deepEqual(sanitizeHistory('invalid'), []);
    assert.deepEqual(sanitizeHistory([{ bad: true }, { role: 'user', text: '   ' }]), []);

    const cleaned = sanitizeHistory([
        { role: 'assistant', text: 'Leading bot greeting should be dropped' },
        { role: 'user', text: 'Explain JavaScript.' },
        { role: 'user', text: 'Keep it simple.' },
        { role: 'bot', text: 'JavaScript is a programming language for the web.' },
        { role: 'user', text: 'Dangling user turn should be dropped' }
    ]);

    assert.equal(cleaned.length, 2);
    assert.equal(cleaned[0].role, 'user');
    assert.equal(cleaned[0].parts[0].text, 'Explain JavaScript.\nKeep it simple.');
    assert.equal(cleaned[1].role, 'model');
    assert.equal(cleaned[1].parts[0].text, 'JavaScript is a programming language for the web.');
});

test('classifyGeminiError accurately distinguishes 503, timeout, 401/403, daily quota, and short-term 429', () => {
    assert.equal(classifyGeminiError({ status: 503, message: 'high demand' }).code, 'TRANSIENT_UNAVAILABLE');
    assert.equal(classifyGeminiError({ name: 'TimeoutError', message: 'timed out' }).code, 'TIMEOUT');
    assert.equal(classifyGeminiError({ status: 401, message: 'API_KEY_INVALID' }).code, 'INVALID_API_KEY');
    assert.equal(classifyGeminiError({ status: 401, message: 'API_KEY_INVALID' }).retryableSameModel, false);
    assert.equal(classifyGeminiError({ status: 404, message: 'model not found' }).code, 'MODEL_UNAVAILABLE');
    assert.equal(
        classifyGeminiError({ status: 429, message: 'GenerateRequestsPerDay exceeded your current quota' }).code,
        'DAILY_QUOTA_EXHAUSTED'
    );
    const shortRateLimit = classifyGeminiError({ status: 429, message: 'Too many requests, please retry in 2.5s' });
    assert.equal(shortRateLimit.code, 'RATE_LIMITED');
    assert.equal(shortRateLimit.retryAfterMs, 2500);
});

test('redactSecrets scrubs API keys, MongoDB URIs, and bearer tokens', () => {
    const fakeKey = 'AIza' + 'SyDUMMYKEY1234567890abcdef';
    const fakeUri = 'mongodb+srv://' + 'user:pass@cluster.example.net/db';
    const raw = `Failed with ${fakeKey} and ${fakeUri} and Bearer abc.def.ghi`;
    const clean = redactSecrets(raw);
    assert.ok(!clean.includes(fakeKey));
    assert.ok(!clean.includes('user:pass'));
    assert.ok(!clean.includes('abc.def.ghi'));
});

test('detectIntent avoids treating JavaScript event listener questions as club event lookups', () => {
    const intent = detectIntent('Write a JavaScript function for an event listener');
    assert.equal(intent.isClubRelated, false);
    assert.equal(intent.wantsEvents, false);
});

// ==================== 2. GENERAL QUESTION TESTS (1-7 & 28) ====================

test('General questions (Hi, Python, ML, Bangla API, JS function, AI, Banglish loop, Follow-up)', async () => {
    const calls = [];
    const { models, filterCalls } = createMockModels({
        events: SAMPLE_EVENTS,
        contests: SAMPLE_CONTESTS,
        news: SAMPLE_NEWS
    });

    const mockClient = {
        models: {
            async generateContent(req) {
                calls.push(req);
                const lastUser = req.contents[req.contents.length - 1].parts[0].text;
                if (lastUser.includes('Bangla')) return { text: 'API হলো দুটি সফটওয়্যারের মধ্যে যোগাযোগের মাধ্যম।' };
                if (lastUser.includes('bujhao')) return { text: 'Python for loop diye list ba range er upor bar bar kaj kora jay:\n```python\nfor i in range(3):\n    print(i)\n```' };
                if (lastUser.includes('Simple example dao')) {
                    const hasJsInHistory = req.contents.some(c => c.parts[0].text.includes('JavaScript'));
                    return { text: hasJsInHistory ? 'JavaScript example: `console.log("Hello");`' : 'No context' };
                }
                return { text: `Mock AI answer for: ${lastUser}` };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        sleep: async () => {},
        logger: createSilentLogger()
    });

    // 1. Hi (deterministic, no Gemini call)
    const r1 = await engine.handleMessage({ message: 'Hi' });
    assert.equal(r1.httpStatus, 200);
    assert.equal(r1.body.success, true);
    assert.equal(calls.length, 0);

    // 2-7. General questions routed to Gemini without querying MongoDB
    const prompts = [
        'What is Python?',
        'What is machine learning?',
        'Explain API in Bangla.',
        'Write a JavaScript function.',
        'What is artificial intelligence?',
        'Python for loop bujhao.'
    ];
    for (const p of prompts) {
        const r = await engine.handleMessage({ message: p });
        assert.equal(r.httpStatus, 200);
        assert.equal(r.body.success, true);
        assert.ok(r.body.reply.length > 5);
    }
    assert.equal(calls.length, prompts.length);
    assert.equal(filterCalls.Event.length, 0, 'General questions must not query MongoDB');

    // 28. Bangla/Banglish follow-up preserving history
    const rFollowUp = await engine.handleMessage({
        message: 'Simple example dao.',
        history: [
            { role: 'user', text: 'Explain JavaScript.' },
            { role: 'assistant', text: 'JavaScript is a programming language used for web development.' }
        ]
    });
    assert.equal(rFollowUp.httpStatus, 200);
    assert.ok(rFollowUp.body.reply.includes('JavaScript example'));
});

// ==================== 3. CLUB-SPECIFIC & PUBLIC VISIBILITY SECURITY TESTS (8-14) ====================

test('Club database queries strictly enforce public approval filter and sort upcoming events first', async () => {
    const { models, filterCalls } = createMockModels({
        events: SAMPLE_EVENTS,
        contests: SAMPLE_CONTESTS,
        news: SAMPLE_NEWS
    });

    const geminiCalls = [];
    const mockClient = {
        models: {
            async generateContent(req) {
                geminiCalls.push(req);
                return { text: 'Verified club answer based on provided context.' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        sleep: async () => {},
        logger: createSilentLogger()
    });

    // 10. "Events?" & "List all club events." -> direct verified DB response, no pending/rejected leaked
    const rEvents = await engine.handleMessage({ message: 'Events?' });
    assert.equal(rEvents.httpStatus, 200);
    assert.ok(rEvents.body.reply.includes('Sooner CP Meetup'));
    assert.ok(rEvents.body.reply.includes('Future AI Workshop'));
    assert.ok(!rEvents.body.reply.includes('SECRET PENDING EVENT'));
    assert.ok(!rEvents.body.reply.includes('REJECTED INTERNAL EVENT'));
    assert.deepEqual(filterCalls.Event[0], PUBLIC_CONTENT_FILTER);

    const rAllClubEvents = await engine.handleMessage({ message: 'List all club events.' });
    assert.equal(rAllClubEvents.httpStatus, 200);
    assert.equal(rAllClubEvents.meta.source, 'direct_database');
    assert.ok(rAllClubEvents.body.reply.includes('Sooner CP Meetup'));
    assert.ok(!rAllClubEvents.body.reply.includes('SECRET PENDING EVENT'));

    // 12. "Show upcoming events." -> chronologically sorted (Sooner before Future) and excludes past
    const rUpcoming = await engine.handleMessage({ message: 'Show upcoming events.' });
    assert.equal(rUpcoming.httpStatus, 200);
    const idxSooner = rUpcoming.body.reply.indexOf('Sooner CP Meetup');
    const idxFuture = rUpcoming.body.reply.indexOf('Future AI Workshop');
    assert.ok(idxSooner !== -1 && idxFuture !== -1 && idxSooner < idxFuture, 'Upcoming events must be sorted soonest first');
    assert.ok(!rUpcoming.body.reply.includes('Legacy Approved Event'));

    // 11. "Contests?" -> approved only
    const rContests = await engine.handleMessage({ message: 'Contests?' });
    assert.equal(rContests.httpStatus, 200);
    assert.ok(rContests.body.reply.includes('CUET Inter-University Hackathon'));
    assert.ok(!rContests.body.reply.includes('UNAPPROVED PENDING CONTEST'));

    // 14. "Tell me about club news." -> approved only
    const rNews = await engine.handleMessage({ message: 'Tell me about club news.' });
    assert.equal(rNews.httpStatus, 200);
    assert.ok(rNews.body.reply.includes('CUET Computer Club 2026 Roadmap'));
    assert.ok(!rNews.body.reply.includes('DRAFT PENDING NEWS'));

    // 8, 9, 13: Conversational club questions pass verified context to Gemini
    for (const q of [
        'What is CUET Computer Club?',
        'What can I get as a general member?',
        'What is the registration process?'
    ]) {
        const r = await engine.handleMessage({ message: q });
        assert.equal(r.httpStatus, 200);
        assert.equal(r.body.success, true);
    }
    assert.equal(geminiCalls.length, 3);
    assert.ok(geminiCalls[0].config.systemInstruction.includes('VERIFIED CLUB KNOWLEDGE'));
    assert.ok(!geminiCalls[0].config.systemInstruction.includes('SECRET PENDING EVENT'));
});

// ==================== 4. RELIABILITY & FAILURE RECOVERY TESTS (15-27) ====================

test('Reliability: Primary 503 retries with backoff then falls back to secondary model (Tests 15, 16, 18)', async () => {
    const attemptLog = [];
    const sleeps = [];
    const { models } = createMockModels({ events: SAMPLE_EVENTS });

    const mockClient = {
        models: {
            async generateContent({ model }) {
                attemptLog.push(model);
                if (model === 'gemini-3.5-flash-lite') {
                    const err = new Error('This model is currently experiencing high demand.');
                    err.status = 503;
                    throw err;
                }
                return { text: 'Recovered via fallback model!' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 2,
        sleep: async (ms) => sleeps.push(ms),
        random: () => 0.25,
        logger: createSilentLogger()
    });

    const res = await engine.handleMessage({ message: 'What is Python?' });
    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.reply, 'Recovered via fallback model!');
    assert.equal(res.meta.source, 'gemini_fallback');
    assert.equal(res.meta.model, 'gemini-3.1-flash-lite');
    // 3 attempts on primary (initial + 2 retries), then 1 on fallback
    assert.deepEqual(attemptLog, [
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite'
    ]);
    assert.equal(sleeps.length, 2);
    assert.ok(sleeps[1] >= sleeps[0], 'Backoff should grow exponentially');
});

test('Reliability: Slow primary 503 fails over immediately to fallback model without exhausting request budget', async () => {
    const attemptLog = [];
    let fakeNow = 1000;
    const { models } = createMockModels();

    const mockClient = {
        models: {
            async generateContent({ model }) {
                attemptLog.push(model);
                if (model === 'gemini-3.5-flash-lite') {
                    fakeNow += 12000; // Simulate slow 12s 503
                    const err = new Error('503 high demand');
                    err.status = 503;
                    throw err;
                }
                fakeNow += 1500;
                return { text: 'Fast fallback reply!' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 2,
        now: () => fakeNow,
        sleep: async () => {},
        logger: createSilentLogger()
    });

    const res = await engine.handleMessage({ message: 'Python for loop bujhao.' });
    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.reply, 'Fast fallback reply!');
    assert.deepEqual(attemptLog, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

test('Reliability: Primary timeout falls back; all timeouts return HTTP 504 (Test 17)', async () => {
    const { models } = createMockModels();
    const mockClient = {
        models: {
            async generateContent() {
                const err = new Error('Operation timed out');
                err.name = 'TimeoutError';
                throw err;
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 1,
        sleep: async () => {},
        logger: createSilentLogger()
    });

    const res = await engine.handleMessage({ message: 'What is recursion?' });
    assert.equal(res.httpStatus, 504);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /too long/i);
});

test('Reliability: Both models unavailable returns HTTP 503 for general Q, verified DB fallback for club Q (Test 19)', async () => {
    const { models } = createMockModels({
        events: SAMPLE_EVENTS,
        contests: SAMPLE_CONTESTS,
        news: SAMPLE_NEWS
    });
    const mockClient = {
        models: {
            async generateContent() {
                const err = new Error('503 Service Unavailable');
                err.status = 503;
                throw err;
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 1,
        sleep: async () => {},
        logger: createSilentLogger()
    });

    // General question -> safe HTTP 503 error
    const genRes = await engine.handleMessage({ message: 'What is Python?' });
    assert.equal(genRes.httpStatus, 503);
    assert.equal(genRes.body.success, false);

    // Club question -> graceful verified local/DB fallback HTTP 200
    const clubRes = await engine.handleMessage({ message: 'What can I get from this club as a general member?' });
    assert.equal(clubRes.httpStatus, 200);
    assert.equal(clubRes.body.success, true);
    assert.equal(clubRes.meta.source, 'club_local_fallback');
    assert.ok(clubRes.body.reply.includes('Member Dashboard'));
});

test('Reliability: Missing API key returns 503 for general Q and local fallback for club Q (Test 20)', async () => {
    const { models } = createMockModels({ events: SAMPLE_EVENTS });
    const engine = createChatbotEngine({
        env: { GEMINI_API_KEY: '' },
        models,
        logger: createSilentLogger()
    });

    const genRes = await engine.handleMessage({ message: 'Explain HTTP' });
    assert.equal(genRes.httpStatus, 503);
    assert.equal(genRes.body.success, false);

    const clubRes = await engine.handleMessage({ message: 'Who is the president of CUET Computer Club?' });
    assert.equal(clubRes.httpStatus, 200);
    assert.ok(clubRes.body.reply.includes('Towhidul Islam Rizvi'));
});

test('Reliability: Invalid API key stops immediately without retrying and never leaks secrets (Test 21)', async () => {
    let callCount = 0;
    const logs = [];
    const fakeKey = 'AIza' + 'SySECRET12345678901234567890';
    const { models } = createMockModels();
    const mockClient = {
        models: {
            async generateContent() {
                callCount++;
                const err = new Error(`API_KEY_INVALID for key ${fakeKey}`);
                err.status = 403;
                throw err;
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 2,
        sleep: async () => {},
        logger: createSilentLogger(logs)
    });

    const res = await engine.handleMessage({ message: 'What is C++?' });
    assert.equal(callCount, 1, 'Invalid API key must NOT be retried or attempted on fallback models');
    assert.equal(res.httpStatus, 503);
    assert.equal(res.body.success, false);
    assert.ok(!res.body.error.includes('AIza'));
    assert.ok(!JSON.stringify(logs).includes(fakeKey));
});

test('Reliability: Daily quota exhaustion skips same-model retries and returns 429 when all models exhausted (Test 22)', async () => {
    const attempts = [];
    const { models } = createMockModels();
    const mockClient = {
        models: {
            async generateContent({ model }) {
                attempts.push(model);
                const err = new Error('RESOURCE_EXHAUSTED: GenerateRequestsPerDay quota exceeded');
                err.status = 429;
                throw err;
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
        maxRetries: 2,
        sleep: async () => {},
        logger: createSilentLogger()
    });

    const res = await engine.handleMessage({ message: 'What is neural network?' });
    assert.equal(res.httpStatus, 429);
    assert.match(res.body.error, /daily usage limit/i);
    // Should try each model once (no same-model retries on daily quota)
    assert.deepEqual(attempts, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

test('Reliability: Short-term 429 respects provider Retry-After delay (Test 23)', async () => {
    let calls = 0;
    const sleeps = [];
    const { models } = createMockModels();
    const mockClient = {
        models: {
            async generateContent() {
                calls++;
                if (calls === 1) {
                    const err = new Error('Too many requests. Please retry in 1.5s');
                    err.status = 429;
                    throw err;
                }
                return { text: 'Succeeded after respecting retry delay!' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite'],
        maxRetries: 2,
        sleep: async (ms) => sleeps.push(ms),
        logger: createSilentLogger()
    });

    const res = await engine.handleMessage({ message: 'What is Docker?' });
    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.reply, 'Succeeded after respecting retry delay!');
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] >= 1500, `Expected sleep >= 1500ms, got ${sleeps[0]}`);
});

test('Reliability: MongoDB unavailable still answers general questions and refuses to invent events (Test 24)', async () => {
    const { models } = createMockModels({ failDb: true });
    const mockClient = {
        models: {
            async generateContent() {
                return { text: 'Python is a versatile language.' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite'],
        logger: createSilentLogger()
    });

    const genRes = await engine.handleMessage({ message: 'What is Python?' });
    assert.equal(genRes.httpStatus, 200);
    assert.equal(genRes.body.reply, 'Python is a versatile language.');

    const eventsRes = await engine.handleMessage({ message: 'Events?' });
    assert.equal(eventsRes.httpStatus, 200);
    assert.match(eventsRes.body.reply, /temporarily unavailable|could not be reached/i);
});

// ==================== 5. HTTP ROUTER TESTS: VALIDATION, RATE LIMIT, HISTORY, LOG PRIVACY (25-27) ====================

test('HTTP POST /api/chatbot handles invalid input, long messages, invalid history, rapid requests, and log privacy', async () => {
    const logs = [];
    const { models } = createMockModels({ events: SAMPLE_EVENTS });
    const mockClient = {
        models: {
            async generateContent() {
                return { text: 'HTTP mock reply' };
            }
        }
    };

    const engine = createChatbotEngine({
        geminiClient: mockClient,
        models,
        modelChain: ['gemini-3.5-flash-lite'],
        logger: createSilentLogger(logs)
    });

    const rateLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60000, maxEntries: 50 });
    const app = express();
    app.use(express.json());
    app.use('/api/chatbot', createChatbotRouter({
        engine,
        rateLimiter,
        logger: createSilentLogger(logs)
    }));

    await withServer(app, async (baseUrl) => {
        // Empty message -> 400
        const rEmpty = await postJson(baseUrl, '/api/chatbot', { message: '   ' });
        assert.equal(rEmpty.status, 400);
        assert.equal(rEmpty.body.success, false);

        // 27. Long user message (> MAX_MESSAGE_LENGTH) -> 400
        const rLong = await postJson(baseUrl, '/api/chatbot', { message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) });
        assert.equal(rLong.status, 400);
        assert.equal(rLong.body.success, false);

        // 25. Invalid history shape -> handled safely with 200
        const rBadHist = await postJson(baseUrl, '/api/chatbot', {
            message: 'My private secret text should never be logged',
            history: 'not-an-array'
        });
        assert.equal(rBadHist.status, 200);
        assert.equal(rBadHist.body.success, true);

        // Privacy check: raw user message is NOT in logs
        assert.ok(!JSON.stringify(logs).includes('My private secret text should never be logged'));

        // 26. Rapid requests -> hit rate limit on 4th request (maxRequests = 3)
        const r2 = await postJson(baseUrl, '/api/chatbot', { message: 'Hi' });
        const r3 = await postJson(baseUrl, '/api/chatbot', { message: 'Hi' });
        const r4 = await postJson(baseUrl, '/api/chatbot', { message: 'Hi' });
        assert.equal(r2.status, 200);
        assert.equal(r3.status, 200);
        assert.equal(r4.status, 429);
        assert.ok(r4.headers.get('retry-after'));
    });

    // Verify bounded rate-limiter memory cap
    const boundedLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60000, maxEntries: 10 });
    for (let i = 0; i < 50; i++) {
        boundedLimiter.check(`10.0.0.${i}`);
    }
    assert.ok(boundedLimiter.size() <= 11, `Rate limiter map grew unbounded: ${boundedLimiter.size()}`);
});

// ==================== 6. FRONTEND XSS SAFETY CHECK ====================

test('Frontend cuet-chatbot.js escapes HTML before markdown rendering (prevents XSS)', () => {
    const jsPath = path.join(__dirname, '../../Frontend/js/cuet-chatbot.js');
    const code = fs.readFileSync(jsPath, 'utf8');
    assert.ok(code.includes('function escapeHtml'), 'escapeHtml helper must exist');
    assert.ok(code.includes('div.textContent = text'), 'User bubbles must use textContent');
    assert.ok(code.includes('escapeHtml(text)'), 'Bot markdown renderer must escape HTML first');
    assert.ok(code.includes('sendBtn.disabled = loading'), 'Send button must disable during active requests');
    assert.ok(code.includes('chat-retry-btn'), 'Failed messages must offer a retry button');
});

// ==================== 7. REGRESSION CHECKS: EXISTING WEBSITE ROUTES & STATIC PAGES (29-35) ====================

test('Regression: Existing route modules load cleanly and preserve auth protections', async () => {
    const authRoutes = require('../routes/authRoutes');
    const adminRoutes = require('../routes/adminRoutes');
    const dataRoutes = require('../routes/dataRoutes');
    const uploadRoutes = require('../routes/uploadRoutes');
    const eventRegRoutes = require('../routes/eventRegistrationRoutes');
    const contestRegRoutes = require('../routes/contestRegistrationRoutes');
    const representativeRoutes = require('../routes/representativeRoutes');
    const defaultChatbotRouter = require('../routes/chatbot');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/data', dataRoutes);
    app.use('/api/upload', uploadRoutes);
    app.use('/api/event-registration', eventRegRoutes);
    app.use('/api/contest-registration', contestRegRoutes);
    app.use('/api/representative', representativeRoutes);
    app.use('/api/chatbot', defaultChatbotRouter);

    await withServer(app, async (baseUrl) => {
        // 29. Member login input validation works
        const rLogin = await postJson(baseUrl, '/api/auth/login', { email: '', password: '' });
        assert.equal(rLogin.status, 400);

        // 30. Admin Dashboard routes remain protected (401 without token)
        const rAdmin = await fetch(`${baseUrl}/api/admin/users`);
        assert.equal(rAdmin.status, 401);

        // 31. Representative Dashboard routes remain protected (401 without token)
        const rRep = await fetch(`${baseUrl}/api/representative/my-submissions`);
        assert.equal(rRep.status, 401);

        // 32. Event registration protected route remains protected (401 without token)
        const rEventReg = await postJson(baseUrl, '/api/event-registration/register', {});
        assert.equal(rEventReg.status, 401);

        // 33. Contest registration protected route remains protected (401 without token)
        const rContestReg = await postJson(baseUrl, '/api/contest-registration/register', {});
        assert.equal(rContestReg.status, 401);

        // 34. Image upload remains protected (401 without token)
        const rUpload = await fetch(`${baseUrl}/api/upload/upload`, { method: 'POST' });
        assert.equal(rUpload.status, 401);

        // 35. Existing data route validation remains intact (invalid ObjectId -> 400)
        const rDataInvalid = await fetch(`${baseUrl}/api/data/events/not-a-valid-id`);
        assert.equal(rDataInvalid.status, 400);
        const invalidData = await rDataInvalid.json();
        assert.equal(invalidData.success, false);
    });
});
