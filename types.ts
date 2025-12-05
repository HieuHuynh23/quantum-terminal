export interface DataRecord {
  [key: string]: string | number | boolean | null;
}

export interface ChartSeries {
  key: string;
  color?: string;
  name?: string;
}

export interface ChartConfig {
  type: 'chart';
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter';
  title: string;
  explanation?: string;
  xAxisKey: string;
  series: ChartSeries[];
  data: DataRecord[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  chart?: ChartConfig;
  timestamp: number;
}

export interface ParseResult {
  data: DataRecord[];
  meta: {
    fields: string[];
  };
}

// Augment window for Papaparse
declare global {
  interface Window {
    Papa: any;
  }
}