const express = require('express');
const router = express.Router();
const { getChatbotReply } = require('../services/chatbotServices');

// ==================== POST /api/chat ====================
router.post('/', async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message || message.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const reply = await getChatbotReply(message, history || []);

        res.status(200).json({
            success: true,
            reply
        });

    } catch (error) {
        console.error('[Chatbot Error]:', error.message);
        res.status(500).json({
            success: false,
            message: 'Chatbot failed to respond. Please try again.'
        });
    }
});

module.exports = router;