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
const planAccess = require('./middleware/planAccess');
const moduleAccess = require('./middleware/moduleAccess');

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
const prospectRoutes = require('./routes/prospects');
const weeklyPlanRoutes = require('./routes/weeklyPlans');
const monthlyPlanRoutes = require('./routes/monthlyPlans');
const dailyLogRoutes = require('./routes/dailyLogs');
const projectLogRoutes = require('./routes/projectLogs');
const collaboratorRoutes = require('./routes/collaborators');
const partnerRoutes = require('./routes/partners');

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

// Serve uploaded files.
// nosniff + attachment: file người dùng tải lên nằm cùng origin với app, nếu để
// trình duyệt tự đoán kiểu và render inline thì một file .html/.svg độc hại sẽ
// chạy script đọc được localStorage (nơi chứa JWT).
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
  },
}));

// ==================== AUTH MIDDLEWARE ====================
app.use('/api', authMiddleware);

// ==================== ROUTES ====================
app.get('/api/ping', (req, res) => res.json({ success: true, message: 'pong', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
// Phân quyền theo module, đọc cột quyền từ bảng users mỗi request.
// invoices không có cột quyền riêng -> dùng chung quyền contracts.
app.use('/api/contracts', moduleAccess('contracts'), contractRoutes);
app.use('/api/invoices', moduleAccess('contracts'), invoiceRoutes);
app.use('/api/projects', moduleAccess('projects'), projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/targets', moduleAccess('targets'), targetRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/branches', moduleAccess('branches'), branchRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/provinces', provinceRoutes);
app.use('/api/prospects', prospectRoutes);
// Page Plan: phân quyền theo phòng ban (plans_bd/mkt/qs/des/pm), đọc từ DB mỗi request
app.use('/api/weekly-plans', planAccess('weekly'), weeklyPlanRoutes);
app.use('/api/monthly-plans', planAccess('monthly'), monthlyPlanRoutes);
app.use('/api/daily-logs', planAccess('daily'), dailyLogRoutes);
app.use('/api/project-logs', projectLogRoutes);
app.use('/api/collaborators', collaboratorRoutes);
app.use('/api/partners', partnerRoutes);

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

module.exports = app;
