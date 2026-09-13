const mongoose = require('mongoose');

const eventRegistrationSchema = new mongoose.Schema({
    eventId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Event',
        required: true 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    
    // ==================== USER DETAILS ====================
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    studentId: { type: String },
    department: { type: String },
    semester: { type: String },
    
    // ==================== EVENT PREFERENCES ====================
    dietaryPreference: { 
        type: String, 
        enum: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'No Preference'], 
        default: 'No Preference' 
    },
    tshirtSize: { 
        type: String, 
        enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        default: 'M'
    },
    specialRequirements: { type: String },
    
    // ==================== PAYMENT DETAILS ====================
    // Snapshot of the fee at time of registration (not changed if Event fee changes later)
    registrationFeeSnapshot: { type: Number, default: 0 },
    isFree: { type: Boolean, default: false },
    
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'BDT' },
    paymentGateway: { 
        type: String, 
        enum: ['bKash', 'Nagad', 'Rocket', 'none'],
        default: 'none'
    },
    paymentStatus: { 
        type: String, 
        enum: ['not_required', 'pending', 'confirmed', 'rejected'],
        default: 'pending'
    },
    paymentRejectionReason: { type: String, default: '' },
    transactionId: { 
        type: String,
        default: ''
    },
    
    // ==================== REGISTRATION STATUS ====================
    registrationStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    },
    
}, { timestamps: true });

// Index for faster queries
eventRegistrationSchema.index({ userId: 1, eventId: 1 });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);