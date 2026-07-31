import { useCallback, useState } from 'react';

export interface FilterableItem {
    title: string;
    status: string;
    assigneeId?: string;
}

/**
 * State + logic lọc dùng chung cho kế hoạch tháng và kế hoạch tuần.
 * Trước đây hai section copy nguyên khối này nên dễ lệch pha khi sửa.
 */
export const usePlanFilters = () => {
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>(undefined);

    const hasActiveFilter = Boolean(searchText || statusFilter || assigneeFilter);

    const applyFilters = useCallback(<T extends FilterableItem>(items: T[]): T[] => {
        if (!hasActiveFilter) return items;
        const needle = searchText.toLowerCase();
        return items.filter(item => {
            const matchesSearch = !searchText || item.title.toLowerCase().includes(needle);
            const matchesStatus = !statusFilter || item.status === statusFilter;
            const matchesAssignee = !assigneeFilter || item.assigneeId === assigneeFilter;
            return matchesSearch && matchesStatus && matchesAssignee;
        });
    }, [searchText, statusFilter, assigneeFilter, hasActiveFilter]);

    return {
        searchText, setSearchText,
        statusFilter, setStatusFilter,
        assigneeFilter, setAssigneeFilter,
        hasActiveFilter,
        applyFilters,
    };
};

export type PlanFiltersState = ReturnType<typeof usePlanFilters>;
