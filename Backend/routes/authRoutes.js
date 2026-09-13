const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// ==================== VALIDATION HELPERS ====================

// Email validation regex
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Password strength validation
const isValidPassword = (password) => {
    return password.length >= 6; // At least 6 characters
};

// ==================== MIDDLEWARE ====================

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            message: 'Access Denied: No token provided' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'YOUR_SECRET_KEY'); 
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ 
            success: false,
            message: 'Invalid or Expired Token' 
        });
    }
};

// ==================== ROUTES ====================

// GET Profile (Protected Route)
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                studentId: user.studentId,
                role: user.role,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('[Profile Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error while fetching profile' 
        });
    }
});

// POST Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Email and password are required' 
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email format' 
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`[Login Failed] User not found: ${email}`);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        // Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log(`[Login Failed] Invalid password for: ${email}`);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || 'YOUR_SECRET_KEY',
            { expiresIn: '7d' }
        );

        console.log(`[Login Success] User logged in: ${email}`);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('[Login Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during login' 
        });
    }
});

// POST Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, studentId, password, confirmPassword } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Name, email, and password are required' 
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email format' 
            });
        }

        // Validate password strength
        if (!isValidPassword(password)) {
            return res.status(400).json({ 
                success: false,
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({ 
                success: false,
                message: 'Passwords do not match' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log(`[Register Failed] Email already exists: ${email}`);
            return res.status(400).json({ 
                success: false,
                message: 'User with this email already exists' 
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const newUser = new User({
            name,
            email,
            studentId,
            password: hashedPassword,
            role: 'member'
        });

        // Save to database
        const savedUser = await newUser.save();

        // Generate token
        const token = jwt.sign(
            { id: savedUser._id, role: savedUser.role },
            process.env.JWT_SECRET || 'YOUR_SECRET_KEY',
            { expiresIn: '7d' }
        );

        console.log(`[Register Success] New user registered: ${email}`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: savedUser._id,
                name: savedUser.name,
                email: savedUser.email,
                role: savedUser.role
            }
        });

    } catch (error) {
        console.error('[Register Error]:', error.message);
        res.status(500).json({ 
            success: false,
            message: 'Server error during registration' 
        });
    }
});






// ==================== POST Forgot Password ====================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
 
        // Validate input
        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and new password are required'
            });
        }
 
        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
 
        // Validate password strength
        if (!isValidPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }
 
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`[Forgot Password Failed] Email not found: ${email}`);
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }
 
        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
 
        // Update password in database
        await User.findOneAndUpdate(
            { email },
            { password: hashedPassword }
        );
 
        console.log(`[Forgot Password Success] Password reset for: ${email}`);
 
        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
 
    } catch (error) {
        console.error('[Forgot Password Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error during password reset'
        });
    }
});




module.exports = router;