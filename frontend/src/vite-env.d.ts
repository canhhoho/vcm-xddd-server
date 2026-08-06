/// <reference types="vite/client" />

// Cả hai hằng dưới đây do vite.config.ts inject lúc build (khối `define`).
// __APP_VERSION__ lấy từ frontend/package.json — nguồn chuẩn DUY NHẤT của số
// version hiển thị trên UI, đừng hardcode lại ở đâu khác.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
    readonly VITE_API_MODE: 'gas' | 'rest';
    readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
