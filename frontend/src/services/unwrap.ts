import type { ApiResponse } from './api.interface';

/**
 * api.rest.ts nuốt lỗi HTTP thành { success: false } thay vì throw, nên nếu
 * mutationFn trả thẳng response thì React Query luôn coi là thành công và
 * onError không bao giờ chạy. Bọc qua đây để lỗi nổi lên đúng chỗ.
 */
export async function unwrap<T>(promise: Promise<ApiResponse<T>>, fallbackMessage: string): Promise<T> {
    const res = await promise;
    if (!res.success) throw new Error(res.error || fallbackMessage);
    return res.data as T;
}
