const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Simple rate limiting (in-memory)
const rateLimitMap = new Map();

// Maintainable club knowledge
const CLUB_KNOWLEDGE = `
CUET Computer Club is a community of passionate developers, designers, and tech enthusiasts at CUET.
Activities: Programming (Python, JS, C++, Java, weekly challenges), Workshops (Web, AI/ML, Cloud), Contests (monthly, hackathons), Networking (industry meetups, alumni talks), Projects (open-source), Community (Slack).
Executive Team:
- Adil Raihan: Club President
- Madiha Ahmed Chowdhury: Vice President
- Fahim Ferdous: General Secretary
- Sakib MD. Safwanur Rahman: Vice President (Programming)
- Towhid AL Faysal: Vice President (Organizing)
- Abdur Rahman: Programming Secretary (Development)
Contact: Email: contact@computerclub.com | Phone: +1 (234) 567-890 | Location: Computer Science Building, Room 201 | Office Hours: Mon-Thu 4 PM - 7 PM, Fri 3 PM - 6 PM.
`;

router.post('/', async (req, res) => {
    console.log(`[Chatbot] Received request from ${req.ip}. Message: "${req.body.message}"`);
    try {
        const { message, history = [] } = req.body;

        // Validation
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long' });
        }

        // Basic IP-based Rate Limiting
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const userRate = rateLimitMap.get(ip) || { count: 0, lastTime: now };
        
        if (now - userRate.lastTime > 60000) {
            userRate.count = 1;
            userRate.lastTime = now;
        } else {
            userRate.count++;
            if (userRate.count > 20) {
                return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
            }
        }
        rateLimitMap.set(ip, userRate);

        if (!GEMINI_API_KEY) {
            console.error("Chatbot Error: GEMINI_API_KEY is not configured in .env");
            return res.status(503).json({ error: "Sorry, I'm currently unavailable as my AI provider is not configured. Please contact the administrator." });
        }

        // Retrieve current public database info
        let events = [], contests = [], news = [];
        try {
            [events, contests, news] = await Promise.all([
                Event.find({ status: 'approved' }).sort({ date: -1 }).limit(5).lean(),
                Contest.find({ status: 'approved' }).sort({ date: -1 }).limit(5).lean(),
                News.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(5).lean()
            ]);
        } catch (dbErr) {
            console.error("Database retrieval error in chatbot:", dbErr);
            // Continue with static knowledge if DB fails
        }

        let dbContext = "CURRENT CUET COMPUTER CLUB PUBLIC DATA:\n";
        if (events.length) dbContext += "\n--- EVENTS ---\n" + events.map(e => `- ${e.title} | Date: ${e.date} | Location: ${e.location} | Fee: ${e.registrationFee} | Desc: ${e.description}`).join("\n");
        if (contests.length) dbContext += "\n--- CONTESTS ---\n" + contests.map(c => `- ${c.title} | Date: ${c.date} | Prize: ${c.prize} | Team Size: ${c.teamSize} | Fee: ${c.registrationFee} | Desc: ${c.description}`).join("\n");
        if (news.length) dbContext += "\n--- LATEST NEWS ---\n" + news.map(n => `- ${n.title} (by ${n.author}): ${n.content}`).join("\n");

        // Prepare System Prompt
        const systemInstruction = `You are the CUET Computer Club Assistant. You provide accurate and helpful information about CUET Computer Club using only the provided club knowledge and current public website/database information. 
Do not invent facts, event dates, contest names, fees, prize pools, deadlines, committee members, or contact numbers. If information is unavailable, clearly say "I couldn't find that information in the current CUET Computer Club data."
You are NOT a general-purpose AI assistant. For unrelated questions, politely respond: "I'm the CUET Computer Club Assistant. I can help with CUET Computer Club events, contests, registrations, news, committee information, and other club-related questions."
Never reveal private user information, API keys, passwords, or confidential database content. 
If a user asks about their personal registration/payment status, tell them: "Please check your dashboard for your personal registration and payment status."
You support English, Bangla, and Banglish. Answer naturally in the user's language. Keep answers concise unless detailed explanation is necessary.

CLUB KNOWLEDGE:
${CLUB_KNOWLEDGE}

${dbContext}
`;

        // Format history for @google/genai SDK
        const formattedHistory = [];
        const recentHistory = history.slice(-6);
        
        for (const msg of recentHistory) {
            if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'model') {
                formattedHistory.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                });
            }
        }
        
        formattedHistory.push({
            role: 'user',
            parts: [{ text: message }]
        });

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: formattedHistory,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                maxOutputTokens: 500
            }
        });

        if (!response || !response.text) {
            throw new Error("Empty response from Gemini API");
        }

        res.json({ reply: response.text });
    } catch (error) {
        if (error.status === 403 || (error.message && error.message.includes('denied access'))) {
            console.error("Chatbot Route Error: API Key denied access (403). Check if Generative Language API is enabled for your key, or if the key is valid for this model.");
        } else {
            console.error("Chatbot Route Error:", error.message || error);
        }
        res.status(500).json({ error: "Sorry, I'm unable to respond right now. Please try again in a moment." });
    }
});

module.exports = router;
