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
   * Flush all cache
   */
  flushAll() {
    cache.flushAll();
  }
};

module.exports = CacheService;
