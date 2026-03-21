/**
 * VCM XDDD - API Service (Backward Compatible Re-export)
 * 
 * File này giữ nguyên export `apiService` để tất cả các hook, page, component
 * hiện tại KHÔNG CẦN THAY ĐỔI import path.
 * 
 * Việc chọn backend (GAS vs REST) được quyết định bởi biến môi trường VITE_API_MODE
 * thông qua api.factory.ts.
 */

// Re-export apiService từ factory
export { apiService } from './api.factory';

// Re-export types để các consumer có thể dùng
export type { IApiService, ApiResponse } from './api.interface';
