
import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter
} from 'recharts';
import { ChartConfig } from '../types';

interface ChartRendererProps {
  config: ChartConfig;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Format number for Y axis - make it compact and readable
const formatYAxis = (value: number): string => {
  if (typeof value !== 'number' || isNaN(value)) return '0';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1e9) {
    return (value / 1e9).toFixed(1) + 'B';
  } else if (absValue >= 1e6) {
    return (value / 1e6).toFixed(1) + 'M';
  } else if (absValue >= 1e3) {
    return (value / 1e3).toFixed(1) + 'K';
  } else if (absValue >= 1) {
    return value.toFixed(2);
  } else if (absValue > 0) {
    return value.toFixed(4);
  }
  return '0';
};

// Format number for tooltip - more detailed
const formatTooltipValue = (value: number): string => {
  if (typeof value !== 'number' || isNaN(value)) return '0';
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 4 
  });
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
  const { chartType, data, xAxisKey, series, title } = config;

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey={xAxisKey} stroke="#71717a" />
            <YAxis stroke="#71717a" tickFormatter={formatYAxis} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', color: '#f1f5f9' }}
              formatter={(value: number) => formatTooltipValue(value)}
            />
            <Legend />
            {series.map((s, idx) => (
              <Bar key={s.key} dataKey={s.key} name={s.name || s.key} fill={s.color || COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey={xAxisKey} stroke="#71717a" />
            <YAxis stroke="#71717a" tickFormatter={formatYAxis} />
            <Tooltip 
               contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', color: '#f1f5f9' }}
               formatter={(value: number) => formatTooltipValue(value)}
            />
            <Legend />
            {series.map((s, idx) => (
              <Line 
                key={s.key} 
                type="monotone" 
                dataKey={s.key} 
                name={s.name || s.key} 
                stroke={s.color || COLORS[idx % COLORS.length]} 
                strokeWidth={3} 
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={xAxisKey} stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" tickFormatter={formatYAxis} />
            <Tooltip 
               contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
               formatter={(value: number) => formatTooltipValue(value)}
            />
            <Legend />
            {series.map((s, idx) => (
              <Area 
                key={s.key} 
                type="monotone" 
                dataKey={s.key} 
                name={s.name || s.key} 
                stroke={s.color || COLORS[idx % COLORS.length]} 
                fill={s.color || COLORS[idx % COLORS.length]} 
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        );
      case 'pie':
        // For pie, we typically only use the first series key for value and xAxisKey for name
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey={series[0].key}
              nameKey={xAxisKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
               contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
               formatter={(value: number) => formatTooltipValue(value)}
            />
            <Legend />
          </PieChart>
        );
      case 'scatter':
        return (
           <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="category" dataKey={xAxisKey} name={xAxisKey} stroke="#94a3b8" />
            <YAxis type="number" dataKey={series[0].key} name={series[0].name} stroke="#94a3b8" tickFormatter={formatYAxis} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} 
               contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
               formatter={(value: number) => formatTooltipValue(value)}
            />
            <Legend />
            <Scatter name={series[0].name || "Data"} data={data} fill={series[0].color || COLORS[0]} />
          </ScatterChart>
        )
      default:
        return <div>Unsupported chart type</div>;
    }
  };

  return (
    <div className="w-full bg-slate-800 rounded-lg p-4 border border-slate-700 shadow-sm mt-4">
      <h3 className="text-slate-200 font-semibold mb-4 text-center">{title}</h3>
      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
