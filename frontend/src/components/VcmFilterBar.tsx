import React from 'react';
import { Row } from 'antd';

interface VcmFilterBarProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    gutter?: [number, number] | number;
}

/**
 * Standardized Filter Bar component for the VCM application.
 * Provides consistent styling and layout (Row) for filters.
 */
export const VcmFilterBar: React.FC<VcmFilterBarProps> = ({
    children,
    className = '',
    style,
    gutter = [16, 16]
}) => {
    return (
        <div className={`vcm-filter-bar ${className}`} style={style}>
            <Row gutter={gutter}>
                {children}
            </Row>
        </div>
    );
};
