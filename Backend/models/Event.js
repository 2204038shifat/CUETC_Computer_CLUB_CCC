const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    location: { type: String, required: true },
    capacity: { type: Number },
    description: { type: String, required: true },
    image: { type: String },
    registrationFee: { type: Number, default: 0, min: 0 },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    registrations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EventRegistration' }],
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

module.exports = mongoose.model('Event', eventSchema);