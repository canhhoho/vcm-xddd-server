import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';

/**
 * Hook to sync state with URL search params.
 * @param key The URL query parameter key (e.g., 'search', 'status')
 * @param defaultValue The default value if not present in URL
 * @param options Parser/Formatter options
 */
export function useFilterSync<T>(
    key: string,
    defaultValue: T,
    options?: {
        parse?: (value: string) => T;
        format?: (value: T) => string;
    }
): [T, (newValue: T) => void] {
    const [searchParams, setSearchParams] = useSearchParams();

    // Parse value from URL or use default
    const getInitialValue = (): T => {
        const paramValue = searchParams.get(key);
        if (paramValue !== null) {
            if (options?.parse) {
                return options.parse(paramValue);
            }
            // Default parsing
            if (typeof defaultValue === 'number') {
                return Number(paramValue) as unknown as T;
            }
            if (typeof defaultValue === 'boolean') {
                return (paramValue === 'true') as unknown as T;
            }
            return paramValue as unknown as T;
        }
        return defaultValue;
    };

    const [value, setValue] = useState<T>(getInitialValue);

    // Sync state to URL
    const updateValue = useCallback((newValue: T) => {
        setValue(newValue);
        setSearchParams((prevParams) => {
            const newParams = new URLSearchParams(prevParams);
            let formattedValue: string | undefined;

            if (newValue === undefined || newValue === null || newValue === '' || newValue === 'ALL') {
                // Remove if empty/null/undefined or 'ALL'
                newParams.delete(key);
            } else {
                if (options?.format) {
                    formattedValue = options.format(newValue);
                } else {
                    formattedValue = String(newValue);
                }
                newParams.set(key, formattedValue);
            }
            return newParams;
        }, { replace: true });
    }, [key, setSearchParams, options]);

    // Update state when URL changes (e.g. back button)
    useEffect(() => {
        const urlValue = searchParams.get(key);
        if (urlValue === null) {
            if (value !== defaultValue) {
                setValue(defaultValue);
            }
        } else {
            const parsedUrlValue = options?.parse ? options.parse(urlValue) : (urlValue as unknown as T);
            // Simple equality check (won't work well for objects/dates but okay for primitives)
            if (String(value) !== String(parsedUrlValue)) {
                setValue(parsedUrlValue);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, key]); // Only re-run if params change

    return [value, updateValue];
}

/**
 * Specialized hook for Dayjs date objects
 */
export function useFilterSyncDate(
    key: string,
    defaultValue: Dayjs | null = null,
    formatStr: string = 'MM/YYYY'
): [Dayjs | null, (date: Dayjs | null) => void] {
    return useFilterSync<Dayjs | null>(key, defaultValue, {
        parse: (val) => (val ? dayjs(val, formatStr) : null),
        format: (val) => (val ? val.format(formatStr) : '')
    });
}
