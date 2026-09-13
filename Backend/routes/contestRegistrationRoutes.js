const express = require('express');
const router = express.Router();
const ContestRegistration = require('../models/ContestRegistration');
const Contest = require('../models/Contest');
const { verifyToken } = require('../middleware/auth');

// ==================== GET PAYMENT NUMBER ====================
router.get('/payment-number', (req, res) => {
    res.json({
        success: true,
        paymentNumber: process.env.PAYMENT_NUMBER || '01711234567'
    });
});

// ==================== GET CONTEST DETAILS ====================
router.get('/contest/:contestId', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.contestId);
        if (!contest) {
            return res.status(404).json({ success: false, message: 'Contest not found' });
        }

        const fee = contest.registrationFee || 0;

        const confirmedCount = await ContestRegistration.countDocuments({
            contestId: contest._id,
            registrationStatus: 'confirmed'
        });

        res.json({
            success: true,
            contest: {
                id: contest._id,
                title: contest.title,
                date: contest.date,
                prize: contest.prize,
                description: contest.description,
                registrationFee: fee,
                isFree: fee === 0,
                teamSize: contest.teamSize,
                confirmedCount
            }
        });
    } catch (error) {
        console.error('[Get Contest Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== CHECK IF ALREADY REGISTERED ====================
router.get('/check-registration/:contestId', verifyToken, async (req, res) => {
    try {
        const existingRegistration = await ContestRegistration.findOne({
            contestId: req.params.contestId,
            teamLeaderId: req.user.id
        });

        res.json({
            success: true,
            isRegistered: !!existingRegistration,
            registration: existingRegistration || null
        });
    } catch (error) {
        console.error('[Check Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== SUBMIT CONTEST REGISTRATION ====================
router.post('/register', verifyToken, async (req, res) => {
    try {
        const {
            contestId,
            teamName,
            teamDescription,
            teamMembers,
            leadName,
            leadEmail,
            leadPhone,
            leadDepartment,
            ideaSubmission,
            technologiesUsed,
            paymentGateway,
            transactionId
        } = req.body;

        // Validate required fields
        if (!contestId || !teamName || !teamMembers || teamMembers.length < 1 || !leadName || !leadEmail || !leadPhone) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields: contestId, teamName, teamMembers, leadName, leadEmail, leadPhone' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(leadEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid lead email format' });
        }

        // Fetch contest from DB
        const contest = await Contest.findById(contestId);
        if (!contest) {
            return res.status(404).json({ success: false, message: 'Contest not found' });
        }

        const fee = contest.registrationFee || 0;
        const isFree = fee === 0;

        // Block duplicate registration
        const existingReg = await ContestRegistration.findOne({
            contestId,
            teamLeaderId: req.user.id,
            registrationStatus: { $ne: 'cancelled' }
        });

        if (existingReg) {
            return res.status(400).json({ 
                success: false,
                message: 'Your team already has an active registration for this contest.' 
            });
        }

        let regPaymentGateway = 'none';
        let regTransactionId = '';
        let paymentStatus = 'not_required';
        let registrationStatus = 'confirmed'; // free: immediately confirmed

        if (!isFree) {
            if (!paymentGateway || !transactionId) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Payment method and transaction ID are required for paid contests.' 
                });
            }

            if (!['bKash', 'Nagad', 'Rocket'].includes(paymentGateway)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid payment gateway. Use bKash, Nagad, or Rocket.' 
                });
            }

            const trimmedTxId = transactionId.trim();
            if (!trimmedTxId) {
                return res.status(400).json({ success: false, message: 'Transaction ID cannot be empty.' });
            }

            const dupTx = await ContestRegistration.findOne({ transactionId: trimmedTxId });
            if (dupTx) {
                return res.status(400).json({ 
                    success: false,
                    message: 'This transaction ID has already been used.' 
                });
            }

            regPaymentGateway = paymentGateway;
            regTransactionId = trimmedTxId;
            paymentStatus = 'pending';
            registrationStatus = 'pending';
        }

        const registration = new ContestRegistration({
            contestId,
            teamLeaderId: req.user.id,
            teamName,
            teamDescription,
            teamMembers,
            leadName,
            leadEmail,
            leadPhone,
            leadDepartment,
            ideaSubmission,
            technologiesUsed: technologiesUsed || [],
            registrationFeeSnapshot: fee,
            isFree,
            amount: fee,
            paymentGateway: regPaymentGateway,
            paymentStatus,
            transactionId: regTransactionId,
            registrationStatus
        });

        await registration.save();

        await Contest.findByIdAndUpdate(
            contestId,
            { 
                $push: { registrations: registration._id },
                $addToSet: { participants: req.user.id }
            },
            { new: true }
        );

        console.log(`✅ Contest Registration: user=${req.user.id}, contest=${contest.title}, free=${isFree}, status=${registrationStatus}`);

        res.status(201).json({
            success: true,
            message: isFree 
                ? 'Team registration successful! You are confirmed for this contest.' 
                : 'Team registration submitted! Payment is pending admin verification.',
            registration: {
                id: registration._id,
                contestId: registration.contestId,
                teamName: registration.teamName,
                registrationStatus: registration.registrationStatus,
                paymentStatus: registration.paymentStatus,
                isFree: registration.isFree,
                amount: registration.amount
            }
        });

    } catch (error) {
        console.error('[Contest Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Registration failed: ' + error.message });
    }
});

// ==================== RESUBMIT PAYMENT ====================
router.post('/resubmit-payment/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await ContestRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.teamLeaderId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (registration.paymentStatus !== 'rejected') {
            return res.status(400).json({ 
                success: false,
                message: 'Payment resubmission is only allowed when payment is rejected.' 
            });
        }

        const { paymentGateway, transactionId } = req.body;

        if (!paymentGateway || !transactionId) {
            return res.status(400).json({ success: false, message: 'Payment gateway and transaction ID are required.' });
        }

        if (!['bKash', 'Nagad', 'Rocket'].includes(paymentGateway)) {
            return res.status(400).json({ success: false, message: 'Invalid payment gateway.' });
        }

        const trimmedTxId = transactionId.trim();
        if (!trimmedTxId) {
            return res.status(400).json({ success: false, message: 'Transaction ID cannot be empty.' });
        }

        const dupTx = await ContestRegistration.findOne({ 
            transactionId: trimmedTxId,
            _id: { $ne: registration._id }
        });
        if (dupTx) {
            return res.status(400).json({ success: false, message: 'This transaction ID has already been used.' });
        }

        registration.paymentGateway = paymentGateway;
        registration.transactionId = trimmedTxId;
        registration.paymentStatus = 'pending';
        registration.registrationStatus = 'pending';
        registration.paymentRejectionReason = '';
        await registration.save();

        res.json({
            success: true,
            message: 'Payment resubmitted successfully. Awaiting admin verification.',
            registration: {
                id: registration._id,
                paymentStatus: registration.paymentStatus,
                registrationStatus: registration.registrationStatus
            }
        });

    } catch (error) {
        console.error('[Resubmit Payment Error]:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ==================== GET USER'S CONTEST REGISTRATIONS ====================
router.get('/my-registrations', verifyToken, async (req, res) => {
    try {
        const registrations = await ContestRegistration.find({ teamLeaderId: req.user.id })
            .populate('contestId', 'title date prize image registrationFee description')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: registrations.length, registrations });
    } catch (error) {
        console.error('[Get Registrations Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== GET REGISTRATION DETAILS ====================
router.get('/registration/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await ContestRegistration.findById(req.params.registrationId)
            .populate('contestId')
            .populate('teamLeaderId', 'name email');

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.teamLeaderId._id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        res.json({ success: true, registration });
    } catch (error) {
        console.error('[Get Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== CANCEL REGISTRATION ====================
router.post('/cancel/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await ContestRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.teamLeaderId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (registration.registrationStatus === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Registration is already cancelled' });
        }

        registration.registrationStatus = 'cancelled';
        await registration.save();

        await Contest.findByIdAndUpdate(
            registration.contestId,
            { $pull: { participants: req.user.id, registrations: registration._id } }
        );

        res.json({ success: true, message: 'Team registration cancelled' });
    } catch (error) {
        console.error('[Cancel Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN: GET ALL CONTEST REGISTRATIONS ====================
router.get('/admin/all', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { contestId, paymentStatus, registrationStatus } = req.query;
        const filter = {};
        if (contestId) filter.contestId = contestId;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (registrationStatus) filter.registrationStatus = registrationStatus;

        const registrations = await ContestRegistration.find(filter)
            .populate('contestId', 'title date prize registrationFee')
            .populate('teamLeaderId', 'name email studentId')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: registrations.length, registrations });
    } catch (error) {
        console.error('[Admin Get Registrations Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN: VERIFY PAYMENT ====================
router.post('/admin/verify-payment/:registrationId', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const registration = await ContestRegistration.findById(req.params.registrationId);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.isFree) {
            return res.status(400).json({ success: false, message: 'Cannot verify payment for a free registration.' });
        }

        if (registration.paymentStatus === 'confirmed') {
            return res.status(400).json({ success: false, message: 'Payment is already confirmed.' });
        }

        registration.paymentStatus = 'confirmed';
        registration.registrationStatus = 'confirmed';
        registration.paymentRejectionReason = '';
        await registration.save();

        console.log(`[Admin] Contest payment confirmed: ${registration._id}`);
        res.json({ success: true, message: 'Payment verified and registration confirmed.' });
    } catch (error) {
        console.error('[Admin Verify Payment Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN: REJECT PAYMENT ====================
router.post('/admin/reject-payment/:registrationId', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
        }

        const registration = await ContestRegistration.findById(req.params.registrationId);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.isFree) {
            return res.status(400).json({ success: false, message: 'Cannot reject payment for a free registration.' });
        }

        if (registration.paymentStatus === 'confirmed') {
            return res.status(400).json({ success: false, message: 'Cannot reject an already confirmed payment.' });
        }

        registration.paymentStatus = 'rejected';
        registration.registrationStatus = 'pending';
        registration.paymentRejectionReason = reason.trim();
        await registration.save();

        console.log(`[Admin] Contest payment rejected: ${registration._id}, reason: ${reason}`);
        res.json({ success: true, message: 'Payment rejected. Team can resubmit.' });
    } catch (error) {
        console.error('[Admin Reject Payment Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;