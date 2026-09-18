const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    image: { type: String }, // Image URL
    content: { type: String, required: true },
    author: { type: String }, // Admin name
    views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('News', newsSchema);