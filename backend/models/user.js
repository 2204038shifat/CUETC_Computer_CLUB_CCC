const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    studentId: { type: String },
    role: { 
        type: String, 
        enum: ['member', 'admin'], 
        default: 'member' // Everyone is a member by default
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);