const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

// 1. MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. IMPORT ROUTES
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dataRoutes = require('./routes/dataRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const eventRegistrationRoutes = require('./routes/eventRegistrationRoutes');
const contestRegistrationRoutes = require('./routes/contestRegistrationRoutes');
const chatRoutes = require('./routes/chatRoutes'); // ✅ NEW

// 3. USE ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/event-registration', eventRegistrationRoutes);
app.use('/api/contest-registration', contestRegistrationRoutes);
app.use('/api/chat', chatRoutes); // ✅ NEW

// 4. CONNECT TO DATABASE
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB connected"))
  .catch(err => console.log("❌ DB Error:", err));

// 5. DEFAULT ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// 6. START SERVER (only for local development — Vercel handles this itself)
const PORT = process.env.PORT || 5000;
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
}

module.exports = app; // ✅ NEW — required for Vercel serverless