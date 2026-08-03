/**
 * VCM XDDD - Cache Service
 * Port of CacheHelper from Cache.gs
 */
const NodeCache = require('node-cache');

const cache = new NodeCache({ checkperiod: 120 });

// TTL Definitions (seconds) — same as GAS
const TTL = {
  STATIC: 21600,  // 6 hours
  LONG: 3600,     // 1 hour
  MEDIUM: 900,    // 15 minutes
  SHORT: 300      // 5 minutes
};

const CacheService = {
  TTL,

  /**
   * Get data from cache or execute callback to fetch and cache it
   */
  async getOrSet(key, fetchFn, ttl = TTL.SHORT) {
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const data = await fetchFn();

    // Only cache successful responses
    if (data && data.success) {
      cache.set(key, data, ttl);
    }

    return data;
  },

  /**
   * Clear one or multiple keys
   */
  clear(keys) {
    if (!keys || keys.length === 0) return;
    if (Array.isArray(keys)) {
      keys.forEach(k => cache.del(k));
    } else {
      cache.del(keys);
    }
  },

  /**
   * Clear all keys that start with the given prefix
   */
  clearByPrefix(prefix) {
    const keys = cache.keys().filter(k => k.startsWith(prefix));
    if (keys.length > 0) cache.del(keys);
  },

  /**
   * Xoá toàn bộ cache dashboard. Gọi hàm này sau mọi thao tác ghi chạm số liệu
   * dashboard (contracts, invoices, prospects, targets).
   *
   * Bắt buộc dùng prefix: dashboard cache một key cho mỗi cặp (targetDate, viewMode)
   * — `DASHBOARD_STATS_2026-08-03_MODE_MONTH` — nên `clear(['DASHBOARD_STATS'])`
   * không khớp key nào và xoá hụt trong im lặng. targets.js từng viết đúng như vậy:
   * sửa chỉ tiêu xong dashboard vẫn hiện số cũ tới hết TTL, không lỗi, không log.
   */
  invalidateDashboard() {
    this.clearByPrefix('DASHBOARD_STATS');
  },

  /**
   * Flush all cache
   */
  flushAll() {
    cache.flushAll();
  }
};

module.exports = CacheService;
