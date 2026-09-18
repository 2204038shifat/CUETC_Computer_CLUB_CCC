const mongoose = require('mongoose');

const contestRegistrationSchema = new mongoose.Schema({
    contestId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Contest',
        required: true 
    },
    teamLeaderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    
    // ==================== TEAM INFORMATION ====================
    teamName: { type: String, required: true },
    teamDescription: { type: String },
    
    // Team Members (up to 3)
    teamMembers: [{
        name: { type: String, required: true },
        email: { type: String, required: true },
        studentId: { type: String },
        phone: { type: String },
        college: { type: String }
    }],
    
    // ==================== TEAM LEAD DETAILS ====================
    leadName: { type: String, required: true },
    leadEmail: { type: String, required: true },
    leadPhone: { type: String, required: true },
    leadDepartment: { type: String },
    
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
        enum: ['registered', 'waitlisted', 'cancelled', 'disqualified'],
        default: 'registered'
    },
    
    // ==================== CONTEST DETAILS ====================
    ideaSubmission: { type: String },
    technologiesUsed: [{ type: String }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
contestRegistrationSchema.index({ teamLeaderId: 1, contestId: 1 });
// contestRegistrationSchema.index({ transactionId: 1 });

module.exports = mongoose.model('ContestRegistration', contestRegistrationSchema);