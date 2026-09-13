const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    image: { type: String }, // Image URL
    content: { type: String, required: true },
    author: { type: String }, // Admin name or Representative name
    views: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
    },
    rejectionReason: { type: String, default: '' },
    draftChanges: { type: mongoose.Schema.Types.Mixed, default: null },
    reviewedByAdmin: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('News', newsSchema);