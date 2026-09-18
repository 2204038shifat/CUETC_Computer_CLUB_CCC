const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Create upload directories if they don't exist
const uploadDirs = ['contests', 'events', 'news'];
uploadDirs.forEach(dir => {
    const dirPath = path.join(__dirname, '../uploads', dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// ==================== MULTER CONFIGURATION ====================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // ✅ FIX: type is in query or body
        let type = req.query.type || req.body.type || 'contests';
        
        // Validate type
        if (!['contests', 'events', 'news'].includes(type)) {
            type = 'contests';
        }

        console.log(`\n📁 [MULTER DESTINATION]`);
        console.log(`   Type: ${type}`);
        console.log(`   File: ${file.originalname}`);

        const uploadPath = path.join(__dirname, '../uploads', type);
        
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        console.log(`   Path: ${uploadPath}\n`);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        console.log(`   Filename: ${uniqueName}`);
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ==================== UPLOAD ENDPOINT ====================

// ✅ FIX: Use custom middleware to handle upload with proper type detection
router.post('/upload', verifyToken, isAdmin, (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('❌ Multer error:', err.message);
            return res.status(400).json({
                success: false,
                message: err.message
            });
        } else if (err) {
            console.error('❌ Upload error:', err.message);
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        try {
            if (!req.file) {
                console.error('❌ No file received');
                return res.status(400).json({
                    success: false,
                    message: 'No image file provided'
                });
            }

            // ✅ Get type from FormData
            let type = req.body.type || 'contests';
            
            if (!['contests', 'events', 'news'].includes(type)) {
                type = 'contests';
            }

            const imageUrl = `/uploads/${type}/${req.file.filename}`;

            console.log(`\n✅ [UPLOAD SUCCESS]`);
            console.log(`   Type: ${type}`);
            console.log(`   File: ${req.file.filename}`);
            console.log(`   URL: ${imageUrl}\n`);

            res.status(200).json({
                success: true,
                message: 'Image uploaded successfully',
                imageUrl: imageUrl,
                filename: req.file.filename
            });

        } catch (error) {
            console.error('❌ [Upload Error]:', error.message);
            res.status(500).json({
                success: false,
                message: 'Server error during image upload'
            });
        }
    });
});

module.exports = router;