/**
 * VCM XDDD - Express Application
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Route modules
const authRoutes = require('./routes/auth');
const metaRoutes = require('./routes/meta');
const contractRoutes = require('./routes/contracts');
const invoiceRoutes = require('./routes/invoices');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const targetRoutes = require('./routes/targets');
const userRoutes = require('./routes/users');
const permissionRoutes = require('./routes/permissions');
const branchRoutes = require('./routes/branches');
const positionRoutes = require('./routes/positions');
const staffRoutes = require('./routes/staff');
const dashboardRoutes = require('./routes/dashboard');
const activityRoutes = require('./routes/activities');
const provinceRoutes = require('./routes/provinces');

const app = express();

// ==================== MIDDLEWARE ====================

// Security headers
app.use(helmet());

// CORS
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('short'));
}

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ==================== AUTH MIDDLEWARE ====================
app.use('/api', authMiddleware);

// ==================== ROUTES ====================
app.get('/api/ping', (req, res) => res.json({ success: true, message: 'pong', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/provinces', provinceRoutes);

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

module.exports = app;
