const express = require('express');
const router = express.Router();
const EventRegistration = require('../models/EventRegistration');
const Event = require('../models/Event');
const { verifyToken } = require('../middleware/auth');

// ==================== GET PAYMENT NUMBER (safe endpoint) ====================
router.get('/payment-number', (req, res) => {
    res.json({
        success: true,
        paymentNumber: process.env.PAYMENT_NUMBER || '01711234567'
    });
});

// ==================== STEP 1: Get Event Details for Registration ====================
router.get('/event/:eventId', async (req, res) => {
    try {
        const event = await Event.findById(req.params.eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const fee = event.registrationFee || 0;

        // Count only CONFIRMED registrations for capacity check
        const confirmedCount = await EventRegistration.countDocuments({
            eventId: event._id,
            registrationStatus: 'confirmed'
        });

        res.json({
            success: true,
            event: {
                id: event._id,
                title: event.title,
                date: event.date,
                location: event.location,
                description: event.description,
                registrationFee: fee,
                isFree: fee === 0,
                capacity: event.capacity || 0,
                confirmedCount
            }
        });
    } catch (error) {
        console.error('[Get Event Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 2: Check if Already Registered ====================
router.get('/check-registration/:eventId', verifyToken, async (req, res) => {
    try {
        const existingRegistration = await EventRegistration.findOne({
            eventId: req.params.eventId,
            userId: req.user.id
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

// ==================== STEP 3: Submit Registration ====================
router.post('/register', verifyToken, async (req, res) => {
    try {
        const {
            eventId,
            fullName,
            email,
            phone,
            studentId,
            department,
            semester,
            dietaryPreference,
            tshirtSize,
            specialRequirements,
            paymentGateway,
            transactionId
        } = req.body;

        // Validate basic required fields
        if (!eventId || !fullName || !email || !phone) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields: eventId, fullName, email, phone' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        // Fetch event from DB — do NOT trust client-submitted fee
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const fee = event.registrationFee || 0;
        const isFree = fee === 0;

        // Block duplicate registration
        const existingReg = await EventRegistration.findOne({
            eventId,
            userId: req.user.id,
            registrationStatus: { $ne: 'cancelled' }
        });

        if (existingReg) {
            return res.status(400).json({ 
                success: false,
                message: 'You already have an active registration for this event.' 
            });
        }

        // Check capacity (only CONFIRMED registrations count)
        if (event.capacity) {
            const confirmedCount = await EventRegistration.countDocuments({
                eventId,
                registrationStatus: 'confirmed'
            });
            if (confirmedCount >= event.capacity) {
                return res.status(400).json({ 
                    success: false,
                    message: 'This event is at full capacity.' 
                });
            }
        }

        let regPaymentGateway = 'none';
        let regTransactionId = '';
        let paymentStatus = 'not_required';
        let registrationStatus = 'confirmed'; // free: immediately confirmed

        if (!isFree) {
            // Paid registration: require payment fields
            if (!paymentGateway || !transactionId) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Payment method and transaction ID are required for paid events.' 
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

            // Check if transaction ID already used (dedup)
            const dupTx = await EventRegistration.findOne({ transactionId: trimmedTxId });
            if (dupTx) {
                return res.status(400).json({ 
                    success: false,
                    message: 'This transaction ID has already been used.' 
                });
            }

            regPaymentGateway = paymentGateway;
            regTransactionId = trimmedTxId;
            paymentStatus = 'pending';      // Admin must verify
            registrationStatus = 'pending'; // Pending until payment confirmed
        }

        const registration = new EventRegistration({
            eventId,
            userId: req.user.id,
            fullName,
            email,
            phone,
            studentId,
            department,
            semester,
            dietaryPreference: dietaryPreference || 'No Preference',
            tshirtSize: tshirtSize || 'M',
            specialRequirements,
            registrationFeeSnapshot: fee,
            isFree,
            amount: fee,
            paymentGateway: regPaymentGateway,
            paymentStatus,
            transactionId: regTransactionId,
            registrationStatus
        });

        await registration.save();

        // Add to event participants/registrations
        await Event.findByIdAndUpdate(
            eventId,
            { 
                $push: { registrations: registration._id },
                $addToSet: { participants: req.user.id }
            },
            { new: true }
        );

        console.log(`✅ Event Registration: user=${req.user.id}, event=${event.title}, free=${isFree}, status=${registrationStatus}`);

        res.status(201).json({
            success: true,
            message: isFree 
                ? 'Registration successful! You are confirmed for this event.' 
                : 'Registration submitted! Your payment is pending admin verification.',
            registration: {
                id: registration._id,
                eventId: registration.eventId,
                fullName: registration.fullName,
                registrationStatus: registration.registrationStatus,
                paymentStatus: registration.paymentStatus,
                isFree: registration.isFree,
                amount: registration.amount
            }
        });

    } catch (error) {
        console.error('[Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Registration failed: ' + error.message });
    }
});

// ==================== RESUBMIT PAYMENT ====================
router.post('/resubmit-payment/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await EventRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        // Only the owner can resubmit
        if (registration.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Only allowed if payment is rejected
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

        // Check if this tx ID already used by another registration
        const dupTx = await EventRegistration.findOne({ 
            transactionId: trimmedTxId,
            _id: { $ne: registration._id }
        });
        if (dupTx) {
            return res.status(400).json({ success: false, message: 'This transaction ID has already been used.' });
        }

        // Reset payment state — do NOT keep old transaction ID
        registration.paymentGateway = paymentGateway;
        registration.transactionId = trimmedTxId;
        registration.paymentStatus = 'pending';
        registration.registrationStatus = 'pending';
        registration.paymentRejectionReason = ''; // Clear old rejection reason

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

// ==================== GET USER'S EVENT REGISTRATIONS ====================
router.get('/my-registrations', verifyToken, async (req, res) => {
    try {
        const registrations = await EventRegistration.find({ userId: req.user.id })
            .populate('eventId', 'title date location image registrationFee description')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: registrations.length,
            registrations
        });
    } catch (error) {
        console.error('[Get Registrations Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== GET REGISTRATION DETAILS ====================
router.get('/registration/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await EventRegistration.findById(req.params.registrationId)
            .populate('eventId')
            .populate('userId', 'name email');

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.userId._id.toString() !== req.user.id) {
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
        const registration = await EventRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (registration.registrationStatus === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Registration is already cancelled' });
        }

        registration.registrationStatus = 'cancelled';
        await registration.save();

        await Event.findByIdAndUpdate(
            registration.eventId,
            { $pull: { participants: req.user.id, registrations: registration._id } }
        );

        res.json({ success: true, message: 'Registration cancelled successfully' });
    } catch (error) {
        console.error('[Cancel Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ADMIN: GET ALL EVENT REGISTRATIONS ====================
router.get('/admin/all', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { eventId, paymentStatus, registrationStatus } = req.query;
        const filter = {};
        if (eventId) filter.eventId = eventId;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (registrationStatus) filter.registrationStatus = registrationStatus;

        const registrations = await EventRegistration.find(filter)
            .populate('eventId', 'title date location registrationFee')
            .populate('userId', 'name email studentId')
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

        const registration = await EventRegistration.findById(req.params.registrationId);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.isFree) {
            return res.status(400).json({ success: false, message: 'Cannot verify payment for a free registration.' });
        }

        if (registration.paymentStatus === 'confirmed') {
            return res.status(400).json({ success: false, message: 'Payment is already confirmed.' });
        }

        // Only admin can set confirmed — not the user themselves
        registration.paymentStatus = 'confirmed';
        registration.registrationStatus = 'confirmed';
        registration.paymentRejectionReason = '';
        await registration.save();

        console.log(`[Admin] Event payment confirmed: ${registration._id}`);
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

        const registration = await EventRegistration.findById(req.params.registrationId);
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
        registration.registrationStatus = 'pending'; // registration remains, user resubmits
        registration.paymentRejectionReason = reason.trim();
        await registration.save();

        console.log(`[Admin] Event payment rejected: ${registration._id}, reason: ${reason}`);
        res.json({ success: true, message: 'Payment rejected. User can resubmit.' });
    } catch (error) {
        console.error('[Admin Reject Payment Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;