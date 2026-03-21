import React, { useState, useMemo } from 'react';
import './CustomColumnChart.css';

interface ChartData {
    [key: string]: any;
}

interface CustomColumnChartProps {
    data: ChartData[];
    xField: string;
    yField: string;
    seriesField?: string;
    colors?: string[] | ((type: string) => string); // Support array or function
    height?: number;
    maxColumnWidth?: number;
}

const CustomColumnChart: React.FC<CustomColumnChartProps> = ({
    data,
    xField,
    yField,
    seriesField,
    colors = ['#1890FF', '#D1D5DB'],
    height = 280,
    maxColumnWidth = 24
}) => {
    const [hoverData, setHoverData] = useState<{ x: number, y: number, content: any, color: string } | null>(null);

    // 1. Group Data by X Field (e.g., Month or Branch)
    const groupedData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const groups: Record<string, ChartData[]> = {};
        const xValues: string[] = [];

        data.forEach(item => {
            const xVal = item[xField];
            if (!groups[xVal]) {
                groups[xVal] = [];
                xValues.push(xVal);
            }
            groups[xVal].push(item);
        });

        // Ensure proper sorting if needed (optional, typically data is already sorted)
        return xValues.map(xVal => ({
            label: xVal,
            items: groups[xVal]
        }));

    }, [data, xField]);

    // 2. Calculate Scale
    const maxValue = useMemo(() => {
        if (!data || data.length === 0) return 0;
        return Math.max(...data.map(d => Number(d[yField]) || 0)) * 1.1; // Add 10% buffering
    }, [data, yField]);

    // 3. Helper to determine color
    const getColor = (item: ChartData, index: number) => {
        if (typeof colors === 'function') {
            return seriesField ? colors(item[seriesField]) : '#1890FF';
        }
        if (Array.isArray(colors)) {
            // If seriesField exists, map indices to colors
            return colors[index % colors.length];
        }
        return '#1890FF';
    };

    if (!data || data.length === 0) {
        return <div className="empty-state" style={{ height }}>No data available</div>;
    }

    // 4. Determine Legend Items (Unique Series)
    const legendItems = useMemo(() => {
        if (!seriesField) return [];
        const uniqueSeries = Array.from(new Set(data.map(d => d[seriesField])));
        return uniqueSeries.map((s, idx) => ({
            label: s,
            color: typeof colors === 'function' ? colors(s) : (Array.isArray(colors) ? colors[idx % colors.length] : '#999')
        }));
    }, [data, seriesField, colors]);


    // 5. Calculate Ticks (Simple "Nice Numbers" approach)
    const ticks = useMemo(() => {
        if (maxValue === 0) return [0];
        const count = 5;
        const step = Math.ceil(maxValue / count);
        // Round step to nice number (e.g. 100, 500, 1000) for cleaner axis
        const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
        const normalizedStep = Math.ceil(step / magnitude) * magnitude;

        const result = [];
        for (let i = 0; i <= count; i++) {
            result.push(i * normalizedStep);
        }
        return result;
    }, [maxValue]);

    const maxTick = ticks[ticks.length - 1];

    return (
        <div className="custom-chart-container" style={{ height }}>
            {/* Legend */}
            {legendItems.length > 0 && (
                <div className="custom-chart-legend">
                    {legendItems.map(item => (
                        <div key={item.label} className="legend-item">
                            <div className="legend-color" style={{ backgroundColor: item.color }} />
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="chart-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
                {/* Y-Axis Labels */}
                <div className="y-axis">
                    {ticks.map((tick, idx) => (
                        <div key={tick} className="y-axis-label" style={{
                            bottom: `${(tick / maxTick) * 100}%`,
                            transform: 'translateY(50%)' // Center label vertically on tick
                        }}>
                            {Number(tick).toLocaleString()}
                        </div>
                    ))}
                </div>

                {/* Chart Area */}
                <div className="chart-area" style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid #E5E7EB', paddingLeft: '5px' }}>
                    {/* Grid Lines (Background) - Synced with ticks */}
                    <div className="grid-lines">
                        {ticks.slice(0, ticks.length - 1).map((tick, idx) => ( // Skip top or handle all
                            <div key={tick} className="grid-line" style={{
                                bottom: `${(tick / maxTick) * 100}%`
                            }} />
                        ))}
                        {/* Top line */}
                        <div className="grid-line" style={{ top: 0, borderTopStyle: 'dashed', borderTopColor: '#F3F4F6', height: 0, position: 'absolute' }} />
                    </div>

                    {/* Columns */}
                    {groupedData.map((group, groupIdx) => (
                        <div
                            key={group.label}
                            className="column-group"
                            onMouseEnter={(e) => {
                                // Basic tooltip logic could go here, or on bar hover
                            }}
                        >
                            {group.items.map((item, itemIdx) => {
                                const val = Number(item[yField]) || 0;
                                const heightPct = maxTick > 0 ? (val / maxTick) * 100 : 0;
                                const color = getColor(item, itemIdx);

                                return (
                                    <div
                                        key={itemIdx}
                                        className="bar-wrapper"
                                        onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setHoverData({
                                                x: rect.left + rect.width / 2,
                                                y: rect.top,
                                                content: item,
                                                color: color
                                            });
                                        }}
                                        onMouseLeave={() => setHoverData(null)}
                                    >
                                        <div
                                            className="bar"
                                            style={{
                                                height: `${Math.min(heightPct, 100)}%`, // Clamp to 100%
                                                backgroundColor: color,
                                                maxWidth: maxColumnWidth
                                            }}
                                        />
                                    </div>
                                );
                            })}
                            <div className="x-label">{group.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tooltip Portal or Absolute Positioned */}
            {hoverData && (
                <div
                    className="custom-tooltip visible"
                    style={{
                        left: hoverData.x,
                        top: hoverData.y,
                        position: 'fixed' // Fixed to viewport to avoid overflow issues
                    }}
                >
                    <div className="tooltip-title">{hoverData.content[xField]}</div>
                    <div className="tooltip-item">
                        <div className="legend-color" style={{ backgroundColor: hoverData.color }} />
                        <span>{seriesField ? hoverData.content[seriesField] : 'Value'}:</span>
                        <strong>{Number(hoverData.content[yField]).toLocaleString()}</strong>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(CustomColumnChart);
