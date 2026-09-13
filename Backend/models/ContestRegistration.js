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
    
    // Team Members
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
    // Snapshot of the fee at time of registration (not changed if Contest fee changes later)
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
        enum: ['pending', 'confirmed', 'cancelled', 'disqualified'],
        default: 'pending'
    },
    
    // ==================== CONTEST DETAILS ====================
    ideaSubmission: { type: String },
    technologiesUsed: [{ type: String }],
    
}, { timestamps: true });

// Index for faster queries
contestRegistrationSchema.index({ teamLeaderId: 1, contestId: 1 });

module.exports = mongoose.model('ContestRegistration', contestRegistrationSchema);