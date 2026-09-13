const express = require('express');
const User = require('../models/user');
const Event = require('../models/Event');
const Contest = require('../models/Contest');
const News = require('../models/News');
const { verifyToken, isRepresentative } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to ALL representative routes
router.use(verifyToken, isRepresentative);

// Helper to get model by type string
const getModelByType = (type) => {
    switch (type.toLowerCase()) {
        case 'event':
        case 'events':
            return Event;
        case 'contest':
        case 'contests':
            return Contest;
        case 'news':
            return News;
        default:
            return null;
    }
};

// ==================== GET MY SUBMISSIONS ====================
// Returns ONLY submissions created by the current logged-in representative
router.get('/my-submissions', async (req, res) => {
    try {
        const userId = req.user.id;

        const [events, contests, newsList] = await Promise.all([
            Event.find({ createdBy: userId }).sort({ updatedAt: -1 }),
            Contest.find({ createdBy: userId }).sort({ updatedAt: -1 }),
            News.find({ createdBy: userId }).sort({ updatedAt: -1 })
        ]);

        const formattedEvents = events.map(e => ({
            _id: e._id,
            type: 'event',
            title: e.title,
            date: e.date,
            location: e.location,
            capacity: e.capacity,
            description: e.description,
            image: e.image,
            status: e.status,
            rejectionReason: e.rejectionReason,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt
        }));

        const formattedContests = contests.map(c => ({
            _id: c._id,
            type: 'contest',
            title: c.title,
            date: c.date,
            prize: c.prize,
            teamSize: c.teamSize,
            tags: c.tags,
            description: c.description,
            image: c.image,
            status: c.status,
            rejectionReason: c.rejectionReason,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
        }));

        const formattedNews = newsList.map(n => ({
            _id: n._id,
            type: 'news',
            title: n.title,
            content: n.content,
            image: n.image,
            author: n.author,
            status: n.status,
            rejectionReason: n.rejectionReason,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt
        }));

        const allSubmissions = [...formattedEvents, ...formattedContests, ...formattedNews].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        res.json({
            success: true,
            submissions: allSubmissions,
            counts: {
                total: allSubmissions.length,
                pending: allSubmissions.filter(s => s.status === 'pending').length,
                approved: allSubmissions.filter(s => s.status === 'approved').length,
                rejected: allSubmissions.filter(s => s.status === 'rejected').length
            }
        });

    } catch (error) {
        console.error('[Representative Get Submissions Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching submissions'
        });
    }
});

// ==================== CREATE EVENT ====================
// Representative creates event -> immediately becomes pending review
router.post('/events', async (req, res) => {
    try {
        const { title, date, location, capacity, description, image, registrationFee } = req.body;

        if (!title || !date || !location || !description) {
            return res.status(400).json({
                success: false,
                message: 'Title, date, location, and description are required'
            });
        }

        const fee = parseInt(registrationFee, 10);
        if (isNaN(fee) || fee < 0) {
            return res.status(400).json({ success: false, message: 'Registration fee must be a whole number ≥ 0.' });
        }

        const newEvent = new Event({
            title,
            date,
            location,
            capacity: capacity || 0,
            description,
            image: image || 'https://via.placeholder.com/400x300?text=Event',
            registrationFee: fee,
            createdBy: req.user.id,
            status: 'pending',
            rejectionReason: '',
            reviewedByAdmin: false
        });

        await newEvent.save();

        console.log(`[Representative] New event submitted for review: ${title} by ${req.user.id}`);

        res.status(201).json({
            success: true,
            message: 'Event submitted successfully! It is now pending admin review.',
            event: newEvent
        });

    } catch (error) {
        console.error('[Representative Create Event Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while creating event'
        });
    }
});

// ==================== CREATE CONTEST ====================
// Representative creates contest -> immediately becomes pending review
router.post('/contests', async (req, res) => {
    try {
        const { title, date, prize, image, description, teamSize, tags, registrationFee } = req.body;

        if (!title || !date || !prize) {
            return res.status(400).json({
                success: false,
                message: 'Title, date, and prize are required'
            });
        }

        const fee = parseInt(registrationFee, 10);
        if (isNaN(fee) || fee < 0) {
            return res.status(400).json({ success: false, message: 'Registration fee must be a whole number ≥ 0.' });
        }

        const newContest = new Contest({
            title,
            date,
            prize,
            image: image || 'https://via.placeholder.com/400x300?text=Contest',
            description: description || 'Join this exciting contest!',
            teamSize: teamSize || '1-3 members',
            tags: tags || ['Competition'],
            registrationFee: fee,
            createdBy: req.user.id,
            status: 'pending',
            rejectionReason: '',
            reviewedByAdmin: false
        });

        await newContest.save();

        console.log(`[Representative] New contest submitted for review: ${title} by ${req.user.id}`);

        res.status(201).json({
            success: true,
            message: 'Contest submitted successfully! It is now pending admin review.',
            contest: newContest
        });

    } catch (error) {
        console.error('[Representative Create Contest Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while creating contest'
        });
    }
});

// ==================== CREATE NEWS ====================
// Representative creates news -> immediately becomes pending review
router.post('/news', async (req, res) => {
    try {
        const { title, image, content } = req.body;

        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: 'Title and content are required'
            });
        }

        // Fetch representative name for author tag
        const user = await User.findById(req.user.id);
        const authorName = user ? `${user.name} (Representative)` : 'Representative';

        const newNews = new News({
            title,
            image: image || 'https://via.placeholder.com/400x300?text=News',
            content,
            author: authorName,
            createdBy: req.user.id,
            status: 'pending',
            rejectionReason: '',
            reviewedByAdmin: false
        });

        await newNews.save();

        console.log(`[Representative] New news submitted for review: ${title} by ${req.user.id}`);

        res.status(201).json({
            success: true,
            message: 'News submitted successfully! It is now pending admin review.',
            news: newNews
        });

    } catch (error) {
        console.error('[Representative Create News Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while creating news'
        });
    }
});

// ==================== EDIT OWN SUBMISSION ====================
// Representative can edit ONLY their OWN Pending or Rejected submissions
router.put('/submissions/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid submission type. Must be events, contests, or news'
            });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Ownership check: must be their OWN submission
        if (!item.createdBy || item.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You can only edit your own submissions'
            });
        }

        // Status rule: cannot edit Approved content
        if (item.status === 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Approved content cannot be edited by representatives. Only Admins can modify approved content.'
            });
        }

        // Allowed to edit pending or rejected
        if (!['pending', 'rejected'].includes(item.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only pending or rejected submissions can be edited'
            });
        }

        // Update fields based on model
        const updates = req.body;
        if (updates.title) item.title = updates.title;
        if (updates.image) item.image = updates.image;
        if (updates.description !== undefined) item.description = updates.description;
        if (updates.content !== undefined) item.content = updates.content;
        if (updates.date) item.date = updates.date;
        if (updates.location !== undefined) item.location = updates.location;
        if (updates.capacity !== undefined) item.capacity = parseInt(updates.capacity) || 0;
        if (updates.prize !== undefined) item.prize = updates.prize;
        if (updates.teamSize !== undefined) item.teamSize = updates.teamSize;
        if (updates.tags !== undefined) item.tags = updates.tags;
        if (updates.registrationFee !== undefined) {
            const fee = parseInt(updates.registrationFee, 10);
            if (!isNaN(fee) && fee >= 0) item.registrationFee = fee;
        }

        await item.save();

        console.log(`[Representative] Submission updated: ${type} ${id} by ${req.user.id}`);

        res.json({
            success: true,
            message: 'Submission updated successfully',
            item
        });

    } catch (error) {
        console.error('[Representative Edit Submission Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while editing submission'
        });
    }
});

// ==================== RESUBMIT REJECTED SUBMISSION ====================
// Representative resubmits rejected content -> changes status back to 'pending'
router.post('/submissions/:type/:id/resubmit', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid submission type'
            });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Ownership check
        if (!item.createdBy || item.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You can only resubmit your own submissions'
            });
        }

        if (item.status !== 'rejected') {
            return res.status(400).json({
                success: false,
                message: 'Only rejected submissions can be resubmitted for review'
            });
        }

        // Transition: Rejected -> Pending
        item.status = 'pending';
        item.reviewedByAdmin = false;
        // Keep rejectionReason visible as per continuity rules, but indicate resubmitted
        await item.save();

        console.log(`[Representative] Resubmitted rejected content for review: ${type} ${id}`);

        res.json({
            success: true,
            message: 'Submission resubmitted successfully! It is now pending admin review.',
            item
        });

    } catch (error) {
        console.error('[Representative Resubmit Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while resubmitting'
        });
    }
});

// ==================== SUBMIT FOR REVIEW ====================
// Explicit "Submit for Review" action — separate from editing.
// Works for both Pending and Rejected submissions owned by the representative.
// Pending  → stays pending, reviewedByAdmin = false (re-queues for admin)
// Rejected → becomes pending, reviewedByAdmin = false
// Approved → 403 (approved content cannot be re-submitted)
router.post('/submissions/:type/:id/submit-review', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid submission type. Must be events, contests, or news'
            });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Ownership check
        if (!item.createdBy || item.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You can only submit your own content for review'
            });
        }

        // Approved content cannot be re-submitted
        if (item.status === 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Approved content cannot be submitted for review. Contact an Admin if changes are needed.'
            });
        }

        // Rejected or Pending → Pending, reset admin review flag
        const previousStatus = item.status;
        item.status = 'pending';
        item.reviewedByAdmin = false;

        await item.save();

        console.log(`[Representative] Submitted for review: ${type} ${id} (was: ${previousStatus}) by ${req.user.id}`);

        res.json({
            success: true,
            message: 'Submitted for review successfully! An Admin will review your submission.',
            item
        });

    } catch (error) {
        console.error('[Representative Submit For Review Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while submitting for review'
        });
    }
});

// ==================== DELETE OWN SUBMISSION ====================
// Representative can delete ONLY their OWN Pending or Rejected submissions
router.delete('/submissions/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid submission type'
            });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Ownership check
        if (!item.createdBy || item.createdBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: You can only delete your own submissions'
            });
        }

        // Cannot delete approved content
        if (item.status === 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Approved content cannot be deleted by representatives. Only Admins can delete approved content.'
            });
        }

        await Model.findByIdAndDelete(id);

        console.log(`[Representative] Submission deleted: ${type} ${id} by ${req.user.id}`);

        res.json({
            success: true,
            message: 'Submission deleted successfully'
        });

    } catch (error) {
        console.error('[Representative Delete Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting submission'
        });
    }
});

// ==================== NOTIFICATIONS ====================
// In-dashboard notification for representative when their OWN submissions are approved/rejected
router.get('/notifications', async (req, res) => {
    try {
        const userId = req.user.id;

        const [events, contests, newsList] = await Promise.all([
            Event.find({ createdBy: userId, status: { $in: ['approved', 'rejected'] } }).sort({ updatedAt: -1 }).limit(10),
            Contest.find({ createdBy: userId, status: { $in: ['approved', 'rejected'] } }).sort({ updatedAt: -1 }).limit(10),
            News.find({ createdBy: userId, status: { $in: ['approved', 'rejected'] } }).sort({ updatedAt: -1 }).limit(10)
        ]);

        const notifications = [];

        events.forEach(e => {
            notifications.push({
                id: e._id,
                type: 'event',
                title: e.title,
                status: e.status,
                rejectionReason: e.rejectionReason,
                updatedAt: e.updatedAt,
                message: e.status === 'approved' 
                    ? `Your event "${e.title}" was approved by Admin!` 
                    : `Your event "${e.title}" was rejected: ${e.rejectionReason || 'No reason provided'}`
            });
        });

        contests.forEach(c => {
            notifications.push({
                id: c._id,
                type: 'contest',
                title: c.title,
                status: c.status,
                rejectionReason: c.rejectionReason,
                updatedAt: c.updatedAt,
                message: c.status === 'approved' 
                    ? `Your contest "${c.title}" was approved by Admin!` 
                    : `Your contest "${c.title}" was rejected: ${c.rejectionReason || 'No reason provided'}`
            });
        });

        newsList.forEach(n => {
            notifications.push({
                id: n._id,
                type: 'news',
                title: n.title,
                status: n.status,
                rejectionReason: n.rejectionReason,
                updatedAt: n.updatedAt,
                message: n.status === 'approved' 
                    ? `Your news announcement "${n.title}" was approved by Admin!` 
                    : `Your news announcement "${n.title}" was rejected: ${n.rejectionReason || 'No reason provided'}`
            });
        });

        notifications.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({
            success: true,
            notifications
        });

    } catch (error) {
        console.error('[Representative Notifications Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching notifications'
        });
    }
});

module.exports = router;