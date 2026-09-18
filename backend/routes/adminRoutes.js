const express = require('express');
const User = require('../models/user');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to ALL routes (Must be logged in AND an Admin)
router.use(verifyToken, isAdmin);

// ================= ADMIN PROMOTION =================

router.post('/promote-user/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        if (!userId || userId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid user ID format' 
            });
        }

        const user = await User.findByIdAndUpdate(
            userId, 
            { role: 'admin' },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        console.log(`[Admin] User promoted to admin: ${user.email}`);

        res.status(200).json({
            success: true,
            message: 'User promoted to admin successfully',
            user
        });

    } catch (error) {
        console.error('[Promote User Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while promoting user' 
        });
    }
});

// ================= USERS =================

router.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('[Get Users Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching users' 
        });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        if (!userId || userId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid user ID format' 
            });
        }

        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        console.log(`[Admin] User deleted: ${user.email}`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('[Delete User Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while deleting user' 
        });
    }
});

// ================= EVENTS =================

router.post('/events', async (req, res) => {
    try {
        const { title, date, location, capacity, description, image } = req.body;

        // Validation
        if (!title || !date || !location || !description) {
            return res.status(400).json({ 
                success: false,
                message: 'Title, date, location, and description are required' 
            });
        }

        const newEvent = new Event({
            title,
            date,
            location,
            capacity: capacity || 0,
            description,
            image: image || 'https://via.placeholder.com/400x300?text=Event'
        });

        await newEvent.save();

        console.log(`[Admin] New event created: ${title}`);

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event: newEvent
        });

    } catch (error) {
        console.error('[Create Event Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while creating event' 
        });
    }
});

router.delete('/events/:id', async (req, res) => {
    try {
        const eventId = req.params.id;

        if (!eventId || eventId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid event ID format' 
            });
        }

        const event = await Event.findByIdAndDelete(eventId);

        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        console.log(`[Admin] Event deleted: ${event.title}`);

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });

    } catch (error) {
        console.error('[Delete Event Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while deleting event' 
        });
    }
});

// ================= CONTESTS =================

router.post('/contests', async (req, res) => {
    try {
        const { title, date, prize, image, description, teamSize, tags } = req.body;

        // Validation
        if (!title || !date || !prize) {
            return res.status(400).json({ 
                success: false,
                message: 'Title, date, and prize are required' 
            });
        }

        const newContest = new Contest({
            title,
            date,
            prize,
            image: image || 'https://via.placeholder.com/400x300?text=Contest',
            description: description || 'Join this exciting contest!',
            teamSize: teamSize || '1-3 members',
            tags: tags || ['Competition']
        });

        await newContest.save();

        console.log(`[Admin] New contest created: ${title}`);

        res.status(201).json({
            success: true,
            message: 'Contest created successfully',
            contest: newContest
        });

    } catch (error) {
        console.error('[Create Contest Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while creating contest' 
        });
    }
});

router.delete('/contests/:id', async (req, res) => {
    try {
        const contestId = req.params.id;

        if (!contestId || contestId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid contest ID format' 
            });
        }

        const contest = await Contest.findByIdAndDelete(contestId);

        if (!contest) {
            return res.status(404).json({ 
                success: false,
                message: 'Contest not found' 
            });
        }

        console.log(`[Admin] Contest deleted: ${contest.title}`);

        res.json({
            success: true,
            message: 'Contest deleted successfully'
        });

    } catch (error) {
        console.error('[Delete Contest Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while deleting contest' 
        });
    }
});

// ================= NEWS =================

router.post('/news', async (req, res) => {
    try {
        const { title, image, content } = req.body;

        // Validation
        if (!title || !content) {
            return res.status(400).json({ 
                success: false,
                message: 'Title and content are required' 
            });
        }

        const newNews = new News({
            title,
            image: image || 'https://via.placeholder.com/400x300?text=News',
            content,
            author: 'Admin'
        });

        await newNews.save();

        console.log(`[Admin] New news posted: ${title}`);

        res.status(201).json({
            success: true,
            message: 'News published successfully',
            news: newNews
        });

    } catch (error) {
        console.error('[Create News Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while publishing news' 
        });
    }
});

router.delete('/news/:id', async (req, res) => {
    try {
        const newsId = req.params.id;

        if (!newsId || newsId.length !== 24) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid news ID format' 
            });
        }

        const news = await News.findByIdAndDelete(newsId);

        if (!news) {
            return res.status(404).json({ 
                success: false,
                message: 'News not found' 
            });
        }

        console.log(`[Admin] News deleted: ${news.title}`);

        res.json({
            success: true,
            message: 'News deleted successfully'
        });

    } catch (error) {
        console.error('[Delete News Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while deleting news' 
        });
    }
});

module.exports = router;