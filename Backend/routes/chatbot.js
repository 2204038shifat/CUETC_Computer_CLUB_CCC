'use strict';

const express = require('express');
const crypto = require('crypto');
const {
    createChatbotEngine,
    MAX_MESSAGE_LENGTH,
    logEvent
} = require('../services/chatbotEngine');

const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const MAX_RATE_LIMIT_ENTRIES = 5000;

function parsePositiveInt(val, fallback) {
    const parsed = Number.parseInt(val, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(req) {
    const forwarded = req.headers && req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function createRateLimiter(options = {}) {
    const windowMs = parsePositiveInt(
        options.windowMs ?? process.env.CHATBOT_RATE_LIMIT_WINDOW_MS,
        DEFAULT_RATE_LIMIT_WINDOW_MS
    );
    const maxRequests = parsePositiveInt(
        options.maxRequests ?? process.env.CHATBOT_RATE_LIMIT_MAX,
        DEFAULT_RATE_LIMIT_MAX
    );
    const maxEntries = parsePositiveInt(options.maxEntries, MAX_RATE_LIMIT_ENTRIES);
    const nowFn = options.now || Date.now;

    const store = new Map();
    let lastCleanup = nowFn();

    function cleanup(now) {
        for (const [key, entry] of store.entries()) {
            if (now - entry.windowStart >= windowMs) {
                store.delete(key);
            }
        }
        // Hard cap to prevent unbounded memory growth under IP-spoofing floods
        while (store.size > maxEntries) {
            const oldestKey = store.keys().next().value;
            if (oldestKey === undefined) break;
            store.delete(oldestKey);
        }
        lastCleanup = now;
    }

    function check(ip) {
        const now = nowFn();
        if (now - lastCleanup >= windowMs || store.size >= maxEntries) {
            cleanup(now);
        }

        const existing = store.get(ip);
        if (!existing || (now - existing.windowStart) >= windowMs) {
            store.set(ip, { count: 1, windowStart: now });
            return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
        }

        existing.count += 1;
        // Refresh insertion order for LRU eviction
        store.delete(ip);
        store.set(ip, existing);

        if (existing.count > maxRequests) {
            const remainingMs = Math.max(1000, windowMs - (now - existing.windowStart));
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds: Math.ceil(remainingMs / 1000)
            };
        }

        return {
            allowed: true,
            remaining: maxRequests - existing.count,
            retryAfterSeconds: 0
        };
    }

    return {
        check,
        size: () => store.size,
        reset: () => store.clear()
    };
}

function createChatbotRouter(options = {}) {
    const router = express.Router();
    const engine = options.engine || createChatbotEngine(options.engineOptions);
    const rateLimiter = options.rateLimiter || createRateLimiter(options.rateLimitOptions);
    const logger = options.logger || logEvent;

    router.post('/', async (req, res) => {
        const requestId = crypto.randomBytes(6).toString('hex');

        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const { message, history } = body;

            if (typeof message !== 'string' || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Message is required.'
                });
            }

            const trimmed = message.trim();
            if (trimmed.length > MAX_MESSAGE_LENGTH) {
                return res.status(400).json({
                    success: false,
                    error: `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`
                });
            }

            const clientIp = getClientIp(req);
            const rateResult = rateLimiter.check(clientIp);
            if (!rateResult.allowed) {
                res.setHeader('Retry-After', String(rateResult.retryAfterSeconds));
                logger('warn', {
                    event: 'rate_limit_exceeded',
                    requestId,
                    retryAfterSeconds: rateResult.retryAfterSeconds
                });
                return res.status(429).json({
                    success: false,
                    error: 'Too many requests. Please wait a moment and try again.'
                });
            }

            const result = await engine.handleMessage({
                message: trimmed,
                history,
                requestId
            });

            if (result.retryAfterSeconds) {
                res.setHeader('Retry-After', String(result.retryAfterSeconds));
            }

            logger(result.httpStatus >= 500 ? 'error' : 'info', {
                event: 'chatbot_request_completed',
                requestId,
                httpStatus: result.httpStatus,
                msgLen: trimmed.length,
                source: result.meta?.source,
                model: result.meta?.model || null,
                attempts: result.meta?.attempts ?? 0,
                errorCode: result.meta?.errorCode || null,
                latencyMs: result.meta?.latencyMs ?? 0
            });

            return res.status(result.httpStatus).json(result.body);
        } catch (err) {
            logger('error', {
                event: 'chatbot_unhandled_error',
                requestId,
                error: err.message || 'Unhandled error'
            });
            return res.status(500).json({
                success: false,
                error: 'An unexpected error occurred while processing your message. Please try again.'
            });
        }
    });

    router._engine = engine;
    router._rateLimiter = rateLimiter;
    return router;
}

const defaultRouter = createChatbotRouter();
defaultRouter.createChatbotRouter = createChatbotRouter;
defaultRouter.createRateLimiter = createRateLimiter;

module.exports = defaultRouter;
