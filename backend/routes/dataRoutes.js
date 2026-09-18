const express = require('express');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// ==================== EVENTS ====================

// GET all events (Public)
router.get('/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            events
        });
    } catch (error) {
        console.error('[Get Events Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching events' 
        });
    }
});

// GET single event by ID
router.get('/events/:id', async (req, res) => {
    try {
        const eventId = req.params.id;

        if (!eventId || eventId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid event ID format' 
            });
        }

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        res.json({
            success: true,
            event
        });

    } catch (error) {
        console.error('[Get Event Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching event' 
        });
    }
});

// POST Register for an event (Protected route)
router.post('/events/register/:id', verifyToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const userId = req.user.id;

        // Validate event ID
        if (!eventId || eventId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid event ID format' 
            });
        }

        // Find event
        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        // Check if user is already registered
        if (event.participants && event.participants.includes(userId)) {
            return res.status(400).json({ 
                success: false,
                message: 'You are already registered for this event!' 
            });
        }

        // Check event capacity (if specified)
        if (event.capacity && event.participants && event.participants.length >= event.capacity) {
            return res.status(400).json({ 
                success: false,
                message: 'Event is at full capacity!' 
            });
        }

        // Register user for event
        if (!event.participants) {
            event.participants = [];
        }
        event.participants.push(userId);
        await event.save();

        console.log(`[Event Registration] User ${userId} registered for event: ${event.title}`);

        res.status(200).json({
            success: true,
            message: 'Successfully registered for the event!',
            event
        });

    } catch (error) {
        console.error('[Event Registration Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during event registration' 
        });
    }
});

// POST Unregister from an event
router.post('/events/unregister/:id', verifyToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const userId = req.user.id;

        if (!eventId || eventId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid event ID format' 
            });
        }

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        // Check if user is registered
        if (!event.participants || !event.participants.includes(userId)) {
            return res.status(400).json({ 
                success: false,
                message: 'You are not registered for this event' 
            });
        }

        // Remove user from participants
        event.participants = event.participants.filter(id => id.toString() !== userId);
        await event.save();

        console.log(`[Event Unregister] User ${userId} unregistered from event: ${event.title}`);

        res.status(200).json({
            success: true,
            message: 'Successfully unregistered from the event!'
        });

    } catch (error) {
        console.error('[Event Unregister Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during event unregistration' 
        });
    }
});

// ==================== CONTESTS ====================

// GET all contests (Public)
router.get('/contests', async (req, res) => {
    try {
        const contests = await Contest.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            contests
        });
    } catch (error) {
        console.error('[Get Contests Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching contests' 
        });
    }
});

// GET single contest by ID
router.get('/contests/:id', async (req, res) => {
    try {
        const contestId = req.params.id;

        if (!contestId || contestId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid contest ID format' 
            });
        }

        const contest = await Contest.findById(contestId).populate('participants', 'name email');

        if (!contest) {
            return res.status(404).json({ 
                success: false,
                message: 'Contest not found' 
            });
        }

        res.json({
            success: true,
            contest
        });

    } catch (error) {
        console.error('[Get Contest Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching contest' 
        });
    }
});

// POST Register for a contest (Protected route)
router.post('/contests/register/:id', verifyToken, async (req, res) => {
    try {
        const contestId = req.params.id;
        const userId = req.user.id;

        // Validate contest ID
        if (!contestId || contestId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid contest ID format' 
            });
        }

        // Find contest
        const contest = await Contest.findById(contestId);

        if (!contest) {
            return res.status(404).json({ 
                success: false,
                message: 'Contest not found' 
            });
        }

        // Check if user is already registered
        if (contest.participants && contest.participants.includes(userId)) {
            return res.status(400).json({ 
                success: false,
                message: 'You are already registered for this contest!' 
            });
        }

        // Register user for contest
        if (!contest.participants) {
            contest.participants = [];
        }
        contest.participants.push(userId);
        await contest.save();

        console.log(`[Contest Registration] User ${userId} registered for contest: ${contest.title}`);

        res.status(200).json({
            success: true,
            message: 'Successfully registered for the contest!',
            contest
        });

    } catch (error) {
        console.error('[Contest Registration Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during contest registration' 
        });
    }
});

// POST Unregister from a contest
router.post('/contests/unregister/:id', verifyToken, async (req, res) => {
    try {
        const contestId = req.params.id;
        const userId = req.user.id;

        if (!contestId || contestId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid contest ID format' 
            });
        }

        const contest = await Contest.findById(contestId);

        if (!contest) {
            return res.status(404).json({ 
                success: false,
                message: 'Contest not found' 
            });
        }

        // Check if user is registered
        if (!contest.participants || !contest.participants.includes(userId)) {
            return res.status(400).json({ 
                success: false,
                message: 'You are not registered for this contest' 
            });
        }

        // Remove user from participants
        contest.participants = contest.participants.filter(id => id.toString() !== userId);
        await contest.save();

        console.log(`[Contest Unregister] User ${userId} unregistered from contest: ${contest.title}`);

        res.status(200).json({
            success: true,
            message: 'Successfully unregistered from the contest!'
        });

    } catch (error) {
        console.error('[Contest Unregister Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during contest unregistration' 
        });
    }
});

// ==================== NEWS ====================

// GET all news (Public)
router.get('/news', async (req, res) => {
    try {
        const news = await News.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            news
        });
    } catch (error) {
        console.error('[Get News Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching news' 
        });
    }
});

// GET single news by ID
router.get('/news/:id', async (req, res) => {
    try {
        const newsId = req.params.id;

        if (!newsId || newsId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid news ID format' 
            });
        }

        const news = await News.findById(newsId);

        if (!news) {
            return res.status(404).json({ 
                success: false,
                message: 'News not found' 
            });
        }

        res.json({
            success: true,
            news
        });

    } catch (error) {
        console.error('[Get News Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching news' 
        });
    }
});

module.exports = router;