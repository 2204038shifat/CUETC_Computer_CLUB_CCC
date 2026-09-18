const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    prize: { type: String, required: true },
    image: { type: String }, // Image URL
    description: { type: String },
    teamSize: { type: String, default: '1-3 members' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    tags: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Contest', contestSchema);