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
        default: 'XL326666699   '
    },
    specialRequirements: { type: String },
    
    // ==================== PAYMENT DETAILS ====================
    amount: { type: Number, required: true },
    currency: { type: String, default: 'BDT' },
    paymentGateway: { 
        type: String, 
        enum: ['bKash', 'Nagad', 'Rocket'],
        required: true
    },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    transactionId: { 
        type: String, 
        required: true,
        unique: true  // Ensure transaction ID is unique
    },
    
    // ==================== REGISTRATION STATUS ====================
    registrationStatus: {
        type: String,
        enum: ['registered', 'waitlisted', 'cancelled'],
        default: 'registered'
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
eventRegistrationSchema.index({ userId: 1, eventId: 1 });
// eventRegistrationSchema.index({ transactionId: 1 });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);