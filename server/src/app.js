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
const projectMemberAccess = require('./middleware/projectMemberAccess');
const rbac = require('./middleware/rbac');

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
const presenceRoutes = require('./routes/presence');
const notificationRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activities');
const provinceRoutes = require('./routes/provinces');
const prospectRoutes = require('./routes/prospects');
const weeklyPlanRoutes = require('./routes/weeklyPlans');
const monthlyPlanRoutes = require('./routes/monthlyPlans');
const dailyLogRoutes = require('./routes/dailyLogs');
const projectLogRoutes = require('./routes/projectLogs');
const projectWorkItemRoutes = require('./routes/projectWorkItems');
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
// tasks và project-logs thuộc về dự án -> dùng chung cột quyền `users.projects`.
app.use('/api/projects', moduleAccess('projects'), projectRoutes);
app.use('/api/tasks', moduleAccess('projects'), taskRoutes);
app.use('/api/targets', moduleAccess('targets'), targetRoutes);
// Quản trị người dùng: chỉ ADMIN. Trước đây các router này mount trần sau
// authMiddleware nên bất kỳ user đã đăng nhập nào cũng đọc được toàn bộ email +
// ma trận quyền, và PUT /users/:id với {"role":"ADMIN"} để tự nâng quyền.
app.use('/api/users', rbac(['ADMIN']), userRoutes);
app.use('/api/permissions', rbac(['ADMIN']), permissionRoutes);
// Cả 4 tab của page Branches (chi nhánh, nhân sự, CTV, đối tác) dùng chung
// quyền `branches` ở frontend, nên backend phải gate cả 4 bằng cùng cột đó.
// Trước đây chỉ /api/branches có middleware; ba route còn lại mount trần nên
// user branches=NO_ACCESS hoặc role=VIEW vẫn POST/PUT/DELETE được qua cURL.
app.use('/api/branches', moduleAccess('branches'), branchRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/staff', moduleAccess('branches'), staffRoutes);
app.use('/api/dashboard', dashboardRoutes);
// Trạng thái online: mount TRẦN sau authMiddleware, cố ý không rbac/moduleAccess.
// Badge trên header hiển thị cho mọi user đã đăng nhập, không chỉ ADMIN như /api/users.
app.use('/api/presence', presenceRoutes);
// Thông báo gộp nhiều nguồn với nhiều cột quyền khác nhau nên không middleware
// nào gate hộ được — việc lọc theo quyền nằm trong chính route.
app.use('/api/notifications', notificationRoutes);
// Nhật ký hoạt động toàn hệ thống -> chỉ ADMIN (chỉ trang User dùng tới).
app.use('/api/activities', rbac(['ADMIN']), activityRoutes);
app.use('/api/provinces', provinceRoutes);
// Page Kinh doanh (pipeline B2B/B2C) gate bằng quyền `business` ở frontend, backend
// phải gate cùng cột đó. Trước đây mount trần nên user business=NO_ACCESS vẫn đọc và
// xoá được prospect — gồm cả tên khách, SĐT liên hệ, giá trị ước tính.
app.use('/api/prospects', moduleAccess('business'), prospectRoutes);
// Page Plan: phân quyền theo phòng ban (plans_bd/mkt/qs/des/pm), đọc từ DB mỗi request
app.use('/api/weekly-plans', planAccess('weekly'), weeklyPlanRoutes);
app.use('/api/monthly-plans', planAccess('monthly'), monthlyPlanRoutes);
app.use('/api/daily-logs', planAccess('daily'), dailyLogRoutes);
app.use('/api/project-logs', moduleAccess('projects'), projectLogRoutes);
// KHÔNG dùng moduleAccess('projects') ở đây: nó chặn thẳng mọi request ghi khi
// quyền chỉ là VIEW, nên middleware sau không bao giờ nới được cho thành viên dự
// án. projectMemberAccess tự đọc quyền và quyết định — xem comment đầu file đó.
app.use('/api/project-work-items', projectMemberAccess(), projectWorkItemRoutes);
app.use('/api/collaborators', moduleAccess('branches'), collaboratorRoutes);
app.use('/api/partners', moduleAccess('branches'), partnerRoutes);

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

module.exports = app;
