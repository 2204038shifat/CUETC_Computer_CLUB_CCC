const express = require('express');
const router = express.Router();
const EventRegistration = require('../models/EventRegistration');
const Event = require('../models/Event');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth');
const { verifyPayment } = require('../services/paymentService');
const { sendEventConfirmation, sendPaymentInstructions } = require('../services/emailService');

// ==================== STEP 1: Get Event Details for Registration ====================
router.get('/event/:eventId', async (req, res) => {
    try {
        const event = await Event.findById(req.params.eventId);
        
        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        res.json({
            success: true,
            event: {
                id: event._id,
                title: event.title,
                date: event.date,
                location: event.location,
                description: event.description,
                registrationFee: event.registrationFee || 0,
                requiresTshirt: event.requiresTshirt || false,
                includeMeals: event.includeMeals || false,
                capacity: event.capacity || 0,
                registeredCount: event.registrations ? event.registrations.length : 0
            }
        });
    } catch (error) {
        console.error('[Get Event Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 2: Verify Transaction ID ====================
router.post('/verify-transaction', async (req, res) => {
    try {
        const { transactionId, paymentGateway } = req.body;

        if (!transactionId || !paymentGateway) {
            return res.status(400).json({ 
                success: false,
                message: 'Transaction ID and payment gateway are required' 
            });
        }

        // Verify payment with payment gateway
        const verification = await verifyPayment(paymentGateway, transactionId);

        if (!verification.success) {
            return res.status(400).json({ 
                success: false,
                message: verification.message 
            });
        }

        res.json({
            success: true,
            message: 'Transaction verified successfully',
            transactionId: transactionId
        });

    } catch (error) {
        console.error('[Verify Transaction Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 3: Check if Already Registered ====================
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

// ==================== STEP 4: Submit Registration Form ====================
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
            amount,
            paymentGateway,
            transactionId
        } = req.body;

        // Validate required fields
        if (!eventId || !fullName || !email || !phone || !paymentGateway || !transactionId) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields: eventId, fullName, email, phone, paymentGateway, transactionId' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email format' 
            });
        }

        // Verify transaction with payment gateway
        const verification = await verifyPayment(paymentGateway, transactionId);
        
        if (!verification.success) {
            return res.status(400).json({ 
                success: false,
                message: 'Payment verification failed: ' + verification.message 
            });
        }

        // Check if event exists
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ 
                success: false,
                message: 'Event not found' 
            });
        }

        // Check if already registered
        const existingRegistration = await EventRegistration.findOne({
            eventId,
            userId: req.user.id
        });

        if (existingRegistration) {
            return res.status(400).json({ 
                success: false,
                message: 'You are already registered for this event' 
            });
        }

        // Check if transaction already used
        const duplicateTransaction = await EventRegistration.findOne({
            transactionId
        });

        if (duplicateTransaction) {
            return res.status(400).json({ 
                success: false,
                message: 'This transaction has already been used. Please use a different transaction ID.' 
            });
        }

        // Check event capacity
        if (event.capacity && event.registrations && event.registrations.length >= event.capacity) {
            return res.status(400).json({ 
                success: false,
                message: 'Event is at full capacity. You have been added to the waitlist.' 
            });
        }

        // Create registration
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
            amount: amount || event.registrationFee || 0,
            paymentGateway,
            paymentStatus: 'completed',
            transactionId,
            registrationStatus: (event.capacity && event.registrations && event.registrations.length >= event.capacity) ? 'waitlisted' : 'registered'
        });

        await registration.save();

        // Update Event registrations array
        await Event.findByIdAndUpdate(
            eventId,
            { 
                $push: { registrations: registration._id },
                $addToSet: { participants: req.user.id }
            },
            { new: true }
        );

        // Send confirmation email
        await sendEventConfirmation(email, event.title, {
            fullName,
            email,
            phone,
            tshirtSize: tshirtSize || 'M',
            amount: amount || event.registrationFee || 0,
            transactionId,
            paymentGateway,
            currency: 'BDT'
        });

        console.log(`✅ Event Registration successful for user: ${req.user.id}, Event: ${event.title}, Transaction: ${transactionId}`);

        res.status(201).json({
            success: true,
            message: 'Registration successful! Confirmation email has been sent.',
            registration: {
                id: registration._id,
                eventId: registration.eventId,
                fullName: registration.fullName,
                registrationStatus: registration.registrationStatus,
                paymentStatus: registration.paymentStatus,
                transactionId: registration.transactionId
            }
        });

    } catch (error) {
        console.error('[Registration Error]:', error);
        res.status(500).json({ 
            success: false,
            message: 'Registration failed: ' + error.message 
        });
    }
});

// ==================== STEP 5: Get User's Event Registrations ====================
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

// ==================== STEP 6: Get Registration Details ====================
router.get('/registration/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await EventRegistration.findById(req.params.registrationId)
            .populate('eventId')
            .populate('userId', 'name email');

        if (!registration) {
            return res.status(404).json({ 
                success: false,
                message: 'Registration not found' 
            });
        }

        // Check authorization
        if (registration.userId._id.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false,
                message: 'Unauthorized' 
            });
        }

        res.json({
            success: true,
            registration
        });

    } catch (error) {
        console.error('[Get Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 7: Cancel Registration ====================
router.post('/cancel/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await EventRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ 
                success: false,
                message: 'Registration not found' 
            });
        }

        if (registration.userId.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false,
                message: 'Unauthorized' 
            });
        }

        if (registration.registrationStatus === 'cancelled') {
            return res.status(400).json({ 
                success: false,
                message: 'Registration is already cancelled' 
            });
        }

        // Update registration status
        registration.registrationStatus = 'cancelled';
        await registration.save();

        // Remove from event participants
        await Event.findByIdAndUpdate(
            registration.eventId,
            { 
                $pull: { 
                    participants: req.user.id, 
                    registrations: registration._id 
                } 
            }
        );

        console.log(`✅ Event registration cancelled: ${registration._id}`);

        res.json({
            success: true,
            message: 'Registration cancelled successfully'
        });

    } catch (error) {
        console.error('[Cancel Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 8: Get Event Statistics (Admin) ====================
router.get('/stats/event/:eventId', async (req, res) => {
    try {
        const registrations = await EventRegistration.find({ eventId: req.params.eventId });
        
        const stats = {
            total: registrations.length,
            registered: registrations.filter(r => r.registrationStatus === 'registered').length,
            waitlisted: registrations.filter(r => r.registrationStatus === 'waitlisted').length,
            cancelled: registrations.filter(r => r.registrationStatus === 'cancelled').length,
            paymentCompleted: registrations.filter(r => r.paymentStatus === 'completed').length,
            tshirtSizes: {},
            dietaryPreferences: {}
        };

        // Count T-shirt sizes
        registrations.forEach(r => {
            stats.tshirtSizes[r.tshirtSize] = (stats.tshirtSizes[r.tshirtSize] || 0) + 1;
            stats.dietaryPreferences[r.dietaryPreference] = (stats.dietaryPreferences[r.dietaryPreference] || 0) + 1;
        });

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('[Stats Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;