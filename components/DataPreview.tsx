import React from 'react';
import { DataRecord } from '../types';

interface DataPreviewProps {
  data: DataRecord[];
  fields: string[];
}

export const DataPreview: React.FC<DataPreviewProps> = ({ data, fields }) => {
  if (data.length === 0) return null;

  // Show only first 20 rows for performance in preview
  const previewData = data.slice(0, 20);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-zinc-300">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-900 border-b border-zinc-800">
            <tr>
              {fields.map((field) => (
                <th key={field} scope="col" className="px-6 py-3 font-medium whitespace-nowrap">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, rowIndex) => (
              <tr 
                key={rowIndex} 
                className="border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
              >
                {fields.map((field) => (
                  <td key={`${rowIndex}-${field}`} className="px-6 py-3 whitespace-nowrap">
                    {String(row[field] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-zinc-900/80 text-xs text-zinc-500 border-t border-zinc-800">
        Showing first {previewData.length} of {data.length} rows
      </div>
    </div>
  );
};