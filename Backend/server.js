const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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
const representativeRoutes = require('./routes/representativeRoutes');
const chatbotRoutes = require('./routes/chatbot');

// 3. USE ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/event-registration', eventRegistrationRoutes);
app.use('/api/contest-registration', contestRegistrationRoutes);
app.use('/api/representative', representativeRoutes);
app.use('/api/chatbot', chatbotRoutes);

// 4. CONNECT TO DATABASE
mongoose.connect(process.env.MONGO_URI, { dbName: 'CUET_Computer_Club', family: 4 })
  .then(() => console.log("✅ DB connected successfully to MongoDB Atlas"))
  .catch(err => console.error("❌ DB Error:", err.message));

// API 404 Handler
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// API Error Handler
app.use('/api', (err, req, res, next) => {
  console.error('API Error:', err.message || err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// 5. DEFAULT ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// 6. START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});