const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');
const User = require('../models/user'); // For committee

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

// Simple rate limiting
const rateLimitMap = new Map();

// Caching
const cache = {
    events: null,
    contests: null,
    news: null,
    committee: null,
    lastFetch: 0
};
const CACHE_TTL = 60000; // 60 seconds

// Core Knowledge (very concise)
const CLUB_KNOWLEDGE = `CUET Computer Club.
Activities: Programming, Workshops, Contests. Contact: contact@computerclub.com | Room 201
Executive Committee 2026-2027:
- Towhidul Islam Rizvi: President
- Shadat Hossain Rony: Vice President (Technical)
- Md. Jamil Hossain: Vice President (Organizing)
- Samonwita Sarker: Vice President (Organizing)
- Md. Mahi Islam: General Secretary
- Md Faladun Islam: Finance Secretary`;

const fetchWithCache = async () => {
    const now = Date.now();
    if (now - cache.lastFetch < CACHE_TTL && cache.events) {
        return; // Use cache
    }
    try {
        const [e, c, n] = await Promise.all([
            Event.find().sort({ createdAt: -1 }).select('title date location capacity description').limit(10).lean(),
            Contest.find().sort({ createdAt: -1 }).select('title date prize teamSize description').limit(10).lean(),
            News.find().sort({ createdAt: -1 }).select('title content').limit(10).lean()
        ]);
        cache.events = e;
        cache.contests = c;
        cache.news = n;
        cache.lastFetch = now;
    } catch (error) {
        console.error("[CHATBOT DB ERROR] Failed to fetch cache:", error);
    }
};

router.post('/', async (req, res) => {
    console.log(`[CHATBOT] Request received from ${req.ip}. Message: "${req.body.message}"`);
    try {
        const { message, history = [] } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }
        if (message.length > 500) {
            return res.status(400).json({ success: false, error: 'Message too long' });
        }

        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const userRate = rateLimitMap.get(ip) || { count: 0, lastTime: now };
        if (now - userRate.lastTime > 60000) {
            userRate.count = 1;
            userRate.lastTime = now;
        } else {
            userRate.count++;
            if (userRate.count > 20) return res.status(429).json({ success: false, error: 'Too many requests. Please wait.' });
        }
        rateLimitMap.set(ip, userRate);

        const msgLower = message.toLowerCase().trim();

        // 1. FAST DETERMINISTIC RESPONSES (No DB, No AI)
        const greetings = ['hi', 'hello', 'hey', 'hi there', 'hello there', 'hy', 'hlw'];
        if (greetings.includes(msgLower)) {
            return res.json({ success: true, reply: "Hello! I am the CUET Computer Club Assistant. How can I help you today?" });
        }
        const thanks = ['thanks', 'thank you', 'thnx', 'dhonnobad', 'tysm'];
        if (thanks.includes(msgLower)) {
            return res.json({ success: true, reply: "You're welcome! Let me know if you need anything else." });
        }

        if (!genAI) {
            console.error("[CHATBOT GEMINI ERROR] GEMINI_API_KEY is not configured");
            return res.status(503).json({ success: false, error: "The AI service is temporarily unavailable." });
        }

        // 2. INTENT DETECTION
        const wantsEvents = /(event|evnt|ivnt|somabesh|program|upcoming|past)/i.test(msgLower);
        const wantsContests = /(contest|contst|hackathon|competition|proti|programming|register|reg)/i.test(msgLower);
        const wantsNews = /(news|khobor|update|notun)/i.test(msgLower);
        const wantsCommittee = /(committee|president|vp|secretary|leader|admin)/i.test(msgLower);
        
        // If not club related, don't fetch DB
        const isClubRelated = wantsEvents || wantsContests || wantsNews || wantsCommittee || /(cuet|club|member)/i.test(msgLower);

        let dbContext = `\n[CLUB]\n${CLUB_KNOWLEDGE}\n`;
        if (isClubRelated) {
            await fetchWithCache();
            if (wantsEvents && cache.events?.length) {
                dbContext += "\n[EVENTS]\n" + cache.events.map(e => `- ${e.title} | Date: ${e.date} | Desc: ${e.description}`).join("\n");
            }
            if (wantsContests && cache.contests?.length) {
                dbContext += "\n[CONTESTS]\n" + cache.contests.map(c => `- ${c.title} | Date: ${c.date} | Prize: ${c.prize} | Desc: ${c.description}`).join("\n");
            }
            if (wantsNews && cache.news?.length) {
                dbContext += "\n[NEWS]\n" + cache.news.map(n => `- ${n.title}: ${n.content}`).join("\n");
            }
        }

        // 3. SHORT SYSTEM PROMPT
        const systemInstruction = `You are the CUET Computer Club Assistant.
Understand natural language, Bangla, Banglish, typos and informal language.
For CUET Computer Club information, use the provided verified context. Never invent club-specific facts.
For general questions (e.g. programming, AI), answer naturally without needing club context.
Keep responses concise (1-5 sentences or short bullet list). Don't explain excessively unless asked.
${dbContext ? `\nCONTEXT:\n${dbContext}` : ''}`;

        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: systemInstruction 
        });

        // 4. KEEP HISTORY SMALL
        const formattedHistory = [];
        const recentHistory = history.slice(-6);
        for (const msg of recentHistory) {
            if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'bot' || msg.role === 'model') {
                formattedHistory.push({
                    role: (msg.role === 'assistant' || msg.role === 'bot' || msg.role === 'model') ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                });
            }
        }

        const chat = model.startChat({ history: formattedHistory });
        
        // Timeout logic removed as per user request
        const result = await chat.sendMessage(message);

        const responseText = result.response.text();
        res.json({ success: true, reply: responseText });
    } catch (error) {
        console.error("[CHATBOT GEMINI ERROR]");
        console.error("status:", error.status || "Unknown");
        console.error("message:", error.message || error);
        
        if (error.message === "Timeout") {
            return res.status(504).json({ success: false, error: "The response is taking too long. Please try again." });
        }
        res.status(500).json({ success: false, error: "The AI service is temporarily unavailable." });
    }
});

module.exports = router;
