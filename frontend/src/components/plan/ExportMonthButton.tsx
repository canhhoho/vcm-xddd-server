import React, { useMemo } from 'react';
import { Button, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { Department, MonthlyPlanItem, User, WeeklyPlan, WeeklyPlanItem } from '../../types';
import { useMonthlyPlans, useWeeklyPlans } from '../../hooks/usePlans';
import { useUsers } from '../../hooks/useUsers';
import { exportPlanWorkbook } from './exportPlanExcel';
import type { PlanSheetSpec } from './exportPlanExcel';
import { buildPlanHeaderRows, monthlyExportColumns, weeklyExportColumns } from './planExportColumns';
import { DATE_FORMAT } from './planConstants';

interface Props {
    department: Department;
    selectedMonth: Dayjs;
}

/**
 * Xuất toàn bộ kế hoạch của một phòng ban trong tháng ra MỘT file nhiều sheet
 * (sheet kế hoạch tháng + mỗi tuần một sheet).
 *
 * Hai query dưới đây dùng đúng bộ tham số của MonthlyPlanSection và DepartmentPlan
 * nên trùng query key và lấy lại từ cache React Query, không phát sinh request mới.
 * Đổi tham số ở hai nơi kia mà quên đồng bộ ở đây sẽ làm trang gọi API hai lần.
 */
const ExportMonthButton: React.FC<Props> = ({ department, selectedMonth }) => {
    const { t } = useTranslation();
    const monthStart = selectedMonth.format('YYYY-MM-DD');
    const weekRange = useMemo(() => ({
        weekFrom: selectedMonth.startOf('month').format('YYYY-MM-DD'),
        weekTo: selectedMonth.endOf('month').format('YYYY-MM-DD'),
    }), [selectedMonth]);

    const { data: monthlyPlans = [] } = useMonthlyPlans({ department, monthStart });
    const { data: weeklyPlans = [] } = useWeeklyPlans({ department, ...weekRange });
    const { data: users = [] } = useUsers();
    const userList = users as User[];

    const monthlyItems: MonthlyPlanItem[] = monthlyPlans[0]?.items || [];
    const weekPlans = useMemo(
        () => [...weeklyPlans].sort((a, b) => dayjs(a.weekStart).diff(dayjs(b.weekStart))),
        [weeklyPlans]
    );

    const totalItems = monthlyItems.length
        + weekPlans.reduce((sum: number, p: WeeklyPlan) => sum + (p.items?.length || 0), 0);

    const handleExport = () => {
        const period = selectedMonth.format('MM/YYYY');

        // Sheet rỗng được exportPlanWorkbook tự loại nên không cần kiểm ở đây
        const monthSheet: PlanSheetSpec<MonthlyPlanItem> = {
            sheetName: t('plans.export.monthSheet'),
            headerRows: buildPlanHeaderRows({ t, department, period, items: monthlyItems }),
            columns: monthlyExportColumns(t, userList),
            items: monthlyItems,
        };

        const weekSheets: PlanSheetSpec<WeeklyPlanItem>[] = weekPlans.map((plan: WeeklyPlan) => {
            const items = plan.items || [];
            const weekPeriod = `${dayjs(plan.weekStart).format(DATE_FORMAT)} - ${dayjs(plan.weekEnd).format(DATE_FORMAT)}`;
            return {
                sheetName: t('plans.export.weekSheet', { range: dayjs(plan.weekStart).format('DD-MM') }),
                headerRows: buildPlanHeaderRows({ t, department, period: weekPeriod, items }),
                columns: weeklyExportColumns(t, userList),
                items,
            };
        });

        const ok = exportPlanWorkbook(
            [monthSheet, ...weekSheets],
            `KeHoach_${department}_${selectedMonth.format('MM_YYYY')}.xlsx`
        );
        message[ok ? 'success' : 'warning'](
            ok ? t('common.exportSuccess') : t('plans.export.noData')
        );
    };

    return (
        <Button
            size="small"
            icon={<FileExcelOutlined />}
            disabled={totalItems === 0}
            onClick={handleExport}
        >
            {t('plans.export.exportMonth')}
        </Button>
    );
};

export default ExportMonthButton;
