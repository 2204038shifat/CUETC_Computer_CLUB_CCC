const jwt = require('jsonwebtoken');

// Verify if the user is logged in
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// Verify if the user is an Admin
const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admins only!' });
    }
    next();
};

// Verify if the user is a Representative
const isRepresentative = (req, res, next) => {
    if (!req.user || req.user.role !== 'representative') {
        return res.status(403).json({ success: false, message: 'Representatives only!' });
    }
    next();
};

// Verify if user is either a Representative or Admin
const isRepresentativeOrAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'representative' && req.user.role !== 'admin')) {
        return res.status(403).json({ success: false, message: 'Representatives or Admins only!' });
    }
    next();
};

module.exports = { verifyToken, isAdmin, isRepresentative, isRepresentativeOrAdmin };