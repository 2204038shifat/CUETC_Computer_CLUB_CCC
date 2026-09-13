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

// Promote Member -> Representative
router.post('/promote-representative/:id', async (req, res) => {
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
            { role: 'representative' },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        console.log(`[Admin] User promoted to representative: ${user.email}`);

        res.status(200).json({
            success: true,
            message: 'User promoted to representative successfully',
            user
        });

    } catch (error) {
        console.error('[Promote Representative Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while promoting representative' 
        });
    }
});

// Change Representative -> Member (Demote)
router.post('/demote-representative/:id', async (req, res) => {
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
            { role: 'member' },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        console.log(`[Admin] Representative changed to member: ${user.email}`);

        res.status(200).json({
            success: true,
            message: 'Representative changed to member successfully',
            user
        });

    } catch (error) {
        console.error('[Demote Representative Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while demoting representative' 
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
        const { title, date, location, capacity, description, image, registrationFee } = req.body;

        // Validation
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
            status: 'approved',
            createdBy: req.user.id,
            reviewedByAdmin: true
        });

        await newEvent.save();

        console.log(`[Admin] New event created: ${title}, fee: ${fee}`);

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
        const { title, date, prize, image, description, teamSize, tags, registrationFee } = req.body;

        // Validation
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
            status: 'approved',
            createdBy: req.user.id,
            reviewedByAdmin: true
        });

        await newContest.save();

        console.log(`[Admin] New contest created: ${title}, fee: ${fee}`);

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
            author: 'Admin',
            status: 'approved',
            createdBy: req.user.id,
            reviewedByAdmin: true
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

// ==================== HELPER ====================
const getModelByType = (type) => {
    switch ((type || '').toLowerCase()) {
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

// ==================== PENDING COUNT NOTIFICATION ====================
// Badge notification count for admin dashboard
router.get('/pending-count', async (req, res) => {
    try {
        const [eventCount, contestCount, newsCount] = await Promise.all([
            Event.countDocuments({ status: 'pending' }),
            Contest.countDocuments({ status: 'pending' }),
            News.countDocuments({ status: 'pending' })
        ]);

        const totalPending = eventCount + contestCount + newsCount;

        res.json({
            success: true,
            pendingCount: totalPending,
            breakdown: {
                events: eventCount,
                contests: contestCount,
                news: newsCount
            }
        });
    } catch (error) {
        console.error('[Pending Count Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while getting pending count'
        });
    }
});

// ==================== ALL REPRESENTATIVE SUBMISSIONS ====================
// Get submissions from representatives with filter and search
router.get('/submissions', async (req, res) => {
    try {
        const { type = 'all', status = 'all', search = '' } = req.query;

        let eventFilter = {};
        let contestFilter = {};
        let newsFilter = {};

        // Status filter
        if (status && status !== 'all') {
            eventFilter.status = status;
            contestFilter.status = status;
            newsFilter.status = status;
        }

        // Search filter (by title)
        if (search && search.trim() !== '') {
            const regex = new RegExp(search.trim(), 'i');
            eventFilter.title = regex;
            contestFilter.title = regex;
            newsFilter.title = regex;
        }

        let events = [];
        let contests = [];
        let newsList = [];

        if (type === 'all' || type === 'event' || type === 'events') {
            events = await Event.find(eventFilter)
                .populate('createdBy', 'name email role')
                .sort({ updatedAt: -1 });
        }

        if (type === 'all' || type === 'contest' || type === 'contests') {
            contests = await Contest.find(contestFilter)
                .populate('createdBy', 'name email role')
                .sort({ updatedAt: -1 });
        }

        if (type === 'all' || type === 'news') {
            newsList = await News.find(newsFilter)
                .populate('createdBy', 'name email role')
                .sort({ updatedAt: -1 });
        }

        const formatSubmission = (item, typeName) => ({
            _id: item._id,
            type: typeName,
            title: item.title,
            date: item.date || null,
            location: item.location || null,
            capacity: item.capacity || null,
            prize: item.prize || null,
            teamSize: item.teamSize || null,
            tags: item.tags || [],
            image: item.image || '',
            description: item.description || '',
            content: item.content || '',
            author: item.author || '',
            status: item.status || 'approved',
            rejectionReason: item.rejectionReason || '',
            reviewedByAdmin: !!item.reviewedByAdmin,
            draftChanges: item.draftChanges || null,
            creator: item.createdBy ? {
                _id: item.createdBy._id,
                name: item.createdBy.name,
                email: item.createdBy.email,
                role: item.createdBy.role
            } : { name: 'Admin / Legacy', email: 'N/A', role: 'admin' },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        });

        const all = [
            ...events.map(e => formatSubmission(e, 'event')),
            ...contests.map(c => formatSubmission(c, 'contest')),
            ...newsList.map(n => formatSubmission(n, 'news'))
        ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({
            success: true,
            submissions: all,
            totalCount: all.length
        });

    } catch (error) {
        console.error('[Get Submissions Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching submissions'
        });
    }
});

// ==================== GET SINGLE SUBMISSION / CONTENT ====================
router.get('/content/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id).populate('createdBy', 'name email role');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        res.json({
            success: true,
            item
        });
    } catch (error) {
        console.error('[Get Single Content Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== MARK SUBMISSION AS REVIEWED ====================
// Enforces "must open/review before Approve or Reject is available"
router.post('/submissions/:type/:id/mark-reviewed', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findByIdAndUpdate(
            id,
            { reviewedByAdmin: true },
            { new: true }
        ).populate('createdBy', 'name email role');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        res.json({
            success: true,
            message: 'Submission marked as opened/reviewed',
            item
        });
    } catch (error) {
        console.error('[Mark Reviewed Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== APPROVE SUBMISSION ====================
router.post('/submissions/:type/:id/approve', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        // Validation rule: Must open/review before approve is available
        if (!item.reviewedByAdmin) {
            return res.status(400).json({
                success: false,
                message: 'You must open and review the submission before approving it.'
            });
        }

        item.status = 'approved';
        item.rejectionReason = '';
        item.reviewedByAdmin = true;
        await item.save();

        console.log(`[Admin] Submission approved: ${type} ${id} (${item.title})`);

        res.json({
            success: true,
            message: 'Submission approved and is now public!',
            item
        });
    } catch (error) {
        console.error('[Approve Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while approving' });
    }
});

// ==================== REJECT SUBMISSION ====================
router.post('/submissions/:type/:id/reject', async (req, res) => {
    try {
        const { type, id } = req.params;
        const { reason } = req.body;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        if (!reason || reason.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'A rejection reason is required'
            });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        // Validation rule: Must open/review before reject is available
        if (!item.reviewedByAdmin) {
            return res.status(400).json({
                success: false,
                message: 'You must open and review the submission before rejecting it.'
            });
        }

        item.status = 'rejected';
        item.rejectionReason = reason.trim();
        item.reviewedByAdmin = true;
        await item.save();

        console.log(`[Admin] Submission rejected: ${type} ${id} - Reason: ${reason}`);

        res.json({
            success: true,
            message: 'Submission has been rejected with reason provided',
            item
        });
    } catch (error) {
        console.error('[Reject Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while rejecting' });
    }
});

// ==================== SEND REJECTED -> PENDING ====================
// Rejection reason remains visible when sent back to Pending
router.post('/submissions/:type/:id/send-to-pending', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        item.status = 'pending';
        item.reviewedByAdmin = false;
        // Notice: item.rejectionReason is explicitly PRESERVED so it remains visible
        await item.save();

        console.log(`[Admin] Sent rejected submission back to pending: ${type} ${id}`);

        res.json({
            success: true,
            message: 'Submission sent back to Pending Review. Rejection reason remains visible.',
            item
        });
    } catch (error) {
        console.error('[Send to Pending Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN EDIT PENDING / REJECTED SUBMISSION ====================
// Rule: after editing, must Save first -> submission remains Pending Review -> must review again before approval/rejection
router.put('/submissions/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        // Guard: approved/public content must NOT be edited through this route.
        // Doing so would overwrite live fields directly and set status back to 'pending',
        // removing it from public view. Admin must use stage-edit → publish-edit instead.
        if (item.status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Approved/public content cannot be edited through this route. Use "Save Changes" (stage-edit) followed by "Publish Changes" (publish-edit) to update approved content safely.'
            });
        }

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

        // Requirement rule:
        // Submission remains Pending Review, and must be reviewed again before approval/rejection
        item.status = 'pending';
        item.reviewedByAdmin = false;

        await item.save();

        console.log(`[Admin] Edited submission ${type} ${id}. Status set to pending, reviewedByAdmin reset.`);

        res.json({
            success: true,
            message: 'Submission saved. It remains in Pending Review and must be reviewed again before approval or rejection.',
            item
        });
    } catch (error) {
        console.error('[Admin Edit Submission Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while editing submission' });
    }
});

// ==================== DELETE SUBMISSION ====================
router.delete('/submissions/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findByIdAndDelete(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        console.log(`[Admin] Deleted ${type} submission: ${id}`);

        res.json({
            success: true,
            message: 'Submission deleted successfully'
        });
    } catch (error) {
        console.error('[Delete Submission Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while deleting' });
    }
});

// ==================== ADMIN EDIT APPROVED CONTENT (STAGING) ====================
// Rule: Approved/Public content remains publicly visible with the old version while Admin edits.
// Admin: Edit -> Save Changes -> old public version remains visible -> Review Changes -> Publish Changes
router.put('/content/:type/:id/stage-edit', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        // Guard: stage-edit is ONLY for approved/public content.
        // Pending or rejected submissions must be edited via PUT /submissions/:type/:id.
        if (item.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: `stage-edit is only for approved/public content. This item has status "${item.status}". Use the submissions edit endpoint instead.`
            });
        }

        // Store new changes in draftChanges without altering the active live fields
        item.draftChanges = {
            ...req.body,
            stagedAt: new Date()
        };

        await item.save();

        console.log(`[Admin] Staged edits saved for approved ${type} ${id}. Public version unchanged.`);

        res.json({
            success: true,
            message: 'Changes saved as draft! The public still sees the previous version until you click "Publish Changes".',
            item
        });
    } catch (error) {
        console.error('[Stage Edit Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while saving draft changes' });
    }
});

// ==================== PUBLISH STAGED EDITS FOR APPROVED CONTENT ====================
// Only after "Publish Changes": new version becomes public
router.post('/content/:type/:id/publish-edit', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        if (!item.draftChanges) {
            return res.status(400).json({
                success: false,
                message: 'No staged draft changes found to publish'
            });
        }

        const drafts = item.draftChanges;

        // Apply draft changes to live fields
        if (drafts.title) item.title = drafts.title;
        if (drafts.image) item.image = drafts.image;
        if (drafts.description !== undefined) item.description = drafts.description;
        if (drafts.content !== undefined) item.content = drafts.content;
        if (drafts.date) item.date = drafts.date;
        if (drafts.location !== undefined) item.location = drafts.location;
        if (drafts.capacity !== undefined) item.capacity = parseInt(drafts.capacity) || 0;
        if (drafts.prize !== undefined) item.prize = drafts.prize;
        if (drafts.teamSize !== undefined) item.teamSize = drafts.teamSize;
        if (drafts.tags !== undefined) item.tags = drafts.tags;
        if (drafts.registrationFee !== undefined) {
            const fee = parseInt(drafts.registrationFee, 10);
            if (!isNaN(fee) && fee >= 0) item.registrationFee = fee;
        }

        // Clear draftChanges
        item.draftChanges = null;
        item.status = 'approved';

        await item.save();

        console.log(`[Admin] Published staged edits for approved ${type} ${id}. New version is now public!`);

        res.json({
            success: true,
            message: 'Changes published successfully! The updated version is now live.',
            item
        });
    } catch (error) {
        console.error('[Publish Edit Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while publishing changes' });
    }
});

// ==================== DISCARD STAGED EDITS ====================
router.delete('/content/:type/:id/discard-edit', async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = getModelByType(type);

        if (!Model) {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        const item = await Model.findById(id);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        item.draftChanges = null;
        await item.save();

        console.log(`[Admin] Discarded staged edits for ${type} ${id}`);

        res.json({
            success: true,
            message: 'Draft changes discarded',
            item
        });
    } catch (error) {
        console.error('[Discard Edit Error]:', error.message);
        res.status(500).json({ success: false, message: 'Server error while discarding draft' });
    }
});

module.exports = router;