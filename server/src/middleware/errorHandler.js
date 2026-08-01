/**
 * VCM XDDD - Global Error Handler
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Vi phạm UNIQUE của PostgreSQL -> 409, không để rơi xuống 500.
  const statusCode = err.statusCode || (err.code === '23505' ? 409 : 500);

  // Chỉ che message của lỗi 5xx (lỗi nội bộ, có thể lộ tên bảng/cột/constraint).
  // Lỗi 4xx là thông báo nghiệp vụ do chính app ném ra qua _planValidators nên
  // phải tới được client, nếu không mọi lỗi 400/403/409 đều hiện "Internal Server Error".
  const isInternal = statusCode >= 500;
  const message = err.code === '23505' && !err.statusCode
    ? 'Duplicate value: record already exists'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: isInternal && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : message
  });
}

module.exports = errorHandler;
