/**
 * VCM XDDD - API Factory
 * 
 * Chọn implementation phù hợp dựa trên biến môi trường VITE_API_MODE.
 * - 'gas'  → GasApiService (Google Apps Script - mặc định)
 * - 'rest' → RestApiService (Node.js REST API)
 */

import type { IApiService } from './api.interface';
import { GasApiService } from './api.gas';
import { RestApiService } from './api.rest';

export type ApiMode = 'gas' | 'rest';

function getApiMode(): ApiMode {
    const mode = (import.meta.env.VITE_API_MODE || 'gas') as string;
    if (mode === 'rest') return 'rest';
    return 'gas';
}

function createApiService(): IApiService {
    const mode = getApiMode();
    
    console.log(`[API Factory] Using ${mode.toUpperCase()} backend`);
    
    switch (mode) {
        case 'rest':
            return new RestApiService();
        case 'gas':
        default:
            return new GasApiService();
    }
}

// Singleton instance
export const apiService: IApiService = createApiService();
export { getApiMode };
