const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    prize: { type: String, required: true },
    image: { type: String },
    description: { type: String },
    teamSize: { type: String, default: '1-3 members' },
    registrationFee: { type: Number, default: 0, min: 0 },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    tags: [{ type: String }],
    registrations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContestRegistration' }],
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

module.exports = mongoose.model('Contest', contestSchema);