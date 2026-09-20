const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
    console.log(`[CHATBOT] Request received from ${req.ip}. Message: "${req.body.message}"`);
    try {
        const { message, history = [] } = req.body;

        // Validation
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }
        if (message.length > 500) {
            return res.status(400).json({ success: false, error: 'Message too long' });
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
                return res.status(429).json({ success: false, error: 'Too many requests. Please wait a minute.' });
            }
        }
        rateLimitMap.set(ip, userRate);

        if (!GEMINI_API_KEY) {
            console.error("[CHATBOT GEMINI ERROR] GEMINI_API_KEY is not configured");
            return res.status(503).json({ success: false, error: "Sorry, I'm currently unavailable as my AI provider is not configured." });
        }

        // Retrieve current public database info
        let events = [], contests = [], news = [];
        try {
            [events, contests, news] = await Promise.all([
                Event.find().sort({ createdAt: -1 }).limit(10).lean(),
                Contest.find().sort({ createdAt: -1 }).limit(10).lean(),
                News.find().sort({ createdAt: -1 }).limit(10).lean()
            ]);
        } catch (dbErr) {
            console.error("[CHATBOT DB ERROR] Failed to fetch context:", dbErr);
        }

        let dbContext = "CURRENT CUET COMPUTER CLUB PUBLIC DATA:\n";
        if (events.length) dbContext += "\n--- EVENTS ---\n" + events.map(e => `- ${e.title} | Date: ${e.date} | Location: ${e.location} | Desc: ${e.description}`).join("\n");
        if (contests.length) dbContext += "\n--- CONTESTS ---\n" + contests.map(c => `- ${c.title} | Date: ${c.date} | Prize: ${c.prize} | Team Size: ${c.teamSize} | Desc: ${c.description}`).join("\n");
        if (news.length) dbContext += "\n--- LATEST NEWS ---\n" + news.map(n => `- ${n.title}: ${n.content}`).join("\n");

        // Prepare System Prompt
        const systemInstruction = `You are the CUET Computer Club Assistant. You behave like a natural conversational AI assistant, not a simple FAQ bot.

CORE RULES:
1. Understand normal English, Bangla, Banglish, mixed language, informal language, and typos (e.g. 'contst', 'upcomming', 'evnt').
2. Do not require exact question formats. Use intent to understand what the user wants.
3. For general conversation (hello, thanks, general knowledge like "what is AI"), respond naturally using your general knowledge. Do not reject the question.
4. For CUET Computer Club questions, use ONLY the "CURRENT CUET COMPUTER CLUB PUBLIC DATA" below. Do not invent club events, dates, fees, or committee members.
5. If the user uses Bangla, reply in Bangla. If Banglish, reply in Banglish or natural Bangla. If English, reply in English.
6. Always be friendly, concise, and easy to read (use bullet points if helpful).
7. If someone asks about registrations or events, use the provided data to answer. If data is unavailable, politely state you couldn't find that specific info.

CLUB KNOWLEDGE:
${CLUB_KNOWLEDGE}

${dbContext}
`;

        // Initialize Gemini with standard GoogleGenerativeAI SDK
        console.log(`[CHATBOT] Initializing Gemini API...`);
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Using gemini-3.5-flash as 3.6-flash throws 503 high demand
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: systemInstruction 
        });

        // Format history for @google/generative-ai SDK (requires exactly "user" and "model" roles)
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
        
        const chat = model.startChat({
            history: formattedHistory
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        if (!responseText) {
            throw new Error("Empty response from Gemini API");
        }

        res.json({ success: true, reply: responseText });
    } catch (error) {
        console.error("[CHATBOT GEMINI ERROR]");
        console.error("status:", error.status || "Unknown");
        console.error("message:", error.message || error);
        if (error.response) console.error("details:", error.response);
        
        res.status(500).json({ success: false, error: "The AI service is temporarily unavailable." });
    }
});

module.exports = router;
