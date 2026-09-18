const express = require('express');
const router = express.Router();
const ContestRegistration = require('../models/ContestRegistration');
const Contest = require('../models/Contest');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth');
const { verifyPayment } = require('../services/paymentService');
const { sendContestConfirmation } = require('../services/emailService');

// ==================== STEP 1: Get Contest Details ====================
router.get('/contest/:contestId', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.contestId);
        
        if (!contest) {
            return res.status(404).json({ 
                success: false,
                message: 'Contest not found' 
            });
        }

        res.json({
            success: true,
            contest: {
                id: contest._id,
                title: contest.title,
                date: contest.date,
                prize: contest.prize,
                description: contest.description,
                registrationFee: contest.registrationFee || 0,
                minTeamSize: contest.minTeamSize || 1,
                maxTeamSize: contest.maxTeamSize || 3,
                rules: contest.rulesAndRegulations || '',
                registeredTeams: contest.registrations ? contest.registrations.length : 0
            }
        });
    } catch (error) {
        console.error('[Get Contest Error]:', error);
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

// ==================== STEP 3: Check if Team Already Registered ====================
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

// ==================== STEP 4: Submit Team Registration ====================
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
            amount,
            paymentGateway,
            transactionId
        } = req.body;

        // Validate required fields
        if (!contestId || !teamName || !teamMembers || teamMembers.length < 1 || !paymentGateway || !transactionId) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(leadEmail)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email format' 
            });
        }

        // Get contest details
        const contest = await Contest.findById(contestId);
        if (!contest) {
            return res.status(404).json({ success: false, message: 'Contest not found' });
        }

        // Verify team size
        if (teamMembers.length < contest.minTeamSize || teamMembers.length > contest.maxTeamSize) {
            return res.status(400).json({ 
                success: false,
                message: `Team size must be between ${contest.minTeamSize} and ${contest.maxTeamSize}` 
            });
        }

        // Verify payment transaction
        const verification = await verifyPayment(paymentGateway, transactionId);
        if (!verification.success) {
            return res.status(400).json({ 
                success: false,
                message: 'Payment verification failed: ' + verification.message 
            });
        }

        // Check if transaction already used
        const duplicateTransaction = await ContestRegistration.findOne({
            transactionId
        });

        if (duplicateTransaction) {
            return res.status(400).json({ 
                success: false,
                message: 'This transaction has already been used' 
            });
        }

        // Check if team lead already registered for this contest
        const existingRegistration = await ContestRegistration.findOne({
            contestId,
            teamLeaderId: req.user.id
        });

        if (existingRegistration) {
            return res.status(400).json({ 
                success: false,
                message: 'Your team is already registered for this contest' 
            });
        }

        // Create registration
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
            amount: amount || contest.registrationFee || 0,
            paymentGateway,
            paymentStatus: 'completed',
            transactionId,
            registrationStatus: 'registered'
        });

        await registration.save();

        // Update Contest
        await Contest.findByIdAndUpdate(
            contestId,
            { 
                $push: { registrations: registration._id },
                $addToSet: { participants: req.user.id }
            },
            { new: true }
        );

        // Send confirmation email
        await sendContestConfirmation(leadEmail, contest.title, {
            teamLeadName: leadName,
            teamName,
            teamMembers,
            amount: amount || contest.registrationFee || 0,
            transactionId,
            paymentGateway,
            currency: 'BDT'
        });

        console.log(`✅ Contest Registration successful: Team ${teamName}, Transaction: ${transactionId}`);

        res.status(201).json({
            success: true,
            message: 'Team registration successful! Confirmation email has been sent.',
            registration: {
                id: registration._id,
                contestId: registration.contestId,
                teamName: registration.teamName,
                registrationStatus: registration.registrationStatus,
                paymentStatus: registration.paymentStatus,
                transactionId: registration.transactionId
            }
        });

    } catch (error) {
        console.error('[Contest Registration Error]:', error);
        res.status(500).json({ 
            success: false,
            message: 'Registration failed: ' + error.message 
        });
    }
});

// ==================== STEP 5: Get User's Contest Registrations ====================
router.get('/my-registrations', verifyToken, async (req, res) => {
    try {
        const registrations = await ContestRegistration.find({ teamLeaderId: req.user.id })
            .populate('contestId', 'title date prize image registrationFee description')
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
        const registration = await ContestRegistration.findById(req.params.registrationId)
            .populate('contestId')
            .populate('teamLeaderId', 'name email');

        if (!registration) {
            return res.status(404).json({ 
                success: false,
                message: 'Registration not found' 
            });
        }

        // Check authorization
        if (registration.teamLeaderId._id.toString() !== req.user.id) {
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

// ==================== STEP 7: Cancel Team Registration ====================
router.post('/cancel/:registrationId', verifyToken, async (req, res) => {
    try {
        const registration = await ContestRegistration.findById(req.params.registrationId);

        if (!registration) {
            return res.status(404).json({ 
                success: false,
                message: 'Registration not found' 
            });
        }

        if (registration.teamLeaderId.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false,
                message: 'Unauthorized' 
            });
        }

        if (registration.registrationStatus === 'cancelled') {
            return res.status(400).json({ 
                success: false,
                message: 'Team registration is already cancelled' 
            });
        }

        registration.registrationStatus = 'cancelled';
        await registration.save();

        await Contest.findByIdAndUpdate(
            registration.contestId,
            { 
                $pull: { 
                    participants: req.user.id, 
                    registrations: registration._id 
                } 
            }
        );

        console.log(`✅ Contest registration cancelled: ${registration._id}`);

        res.json({
            success: true,
            message: 'Team registration cancelled'
        });

    } catch (error) {
        console.error('[Cancel Registration Error]:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STEP 8: Get Contest Statistics (Admin) ====================
router.get('/stats/contest/:contestId', async (req, res) => {
    try {
        const registrations = await ContestRegistration.find({ contestId: req.params.contestId });
        
        const stats = {
            totalTeams: registrations.length,
            registered: registrations.filter(r => r.registrationStatus === 'registered').length,
            waitlisted: registrations.filter(r => r.registrationStatus === 'waitlisted').length,
            cancelled: registrations.filter(r => r.registrationStatus === 'cancelled').length,
            disqualified: registrations.filter(r => r.registrationStatus === 'disqualified').length,
            paymentCompleted: registrations.filter(r => r.paymentStatus === 'completed').length,
            totalParticipants: registrations.reduce((sum, r) => sum + (r.teamMembers ? r.teamMembers.length : 0), 0)
        };

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