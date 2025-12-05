import { ParseResult, DataRecord } from '../types';

export const parseCSV = (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    if (!window.Papa) {
      reject(new Error('Papaparse not loaded'));
      return;
    }

    window.Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        if (results.errors && results.errors.length > 0) {
          console.warn('CSV Parse Warnings:', results.errors);
        }
        resolve({
          data: results.data as DataRecord[],
          meta: {
            fields: results.meta.fields || [],
          },
        });
      },
      error: (error: any) => {
        reject(error);
      },
    });
  });
};

export const generateDemoData = (): ParseResult => {
  const data = [
    { Month: 'Jan', Region: 'North', Sales: 12000, Profit: 4000, Category: 'Electronics' },
    { Month: 'Jan', Region: 'South', Sales: 9000, Profit: 2500, Category: 'Electronics' },
    { Month: 'Feb', Region: 'North', Sales: 15000, Profit: 5200, Category: 'Furniture' },
    { Month: 'Feb', Region: 'South', Sales: 8000, Profit: 2000, Category: 'Furniture' },
    { Month: 'Mar', Region: 'North', Sales: 18000, Profit: 6500, Category: 'Electronics' },
    { Month: 'Mar', Region: 'South', Sales: 11000, Profit: 3800, Category: 'Electronics' },
    { Month: 'Apr', Region: 'North', Sales: 14000, Profit: 4800, Category: 'Furniture' },
    { Month: 'Apr', Region: 'South', Sales: 9500, Profit: 3100, Category: 'Furniture' },
    { Month: 'May', Region: 'North', Sales: 21000, Profit: 7200, Category: 'Electronics' },
    { Month: 'May', Region: 'South', Sales: 13000, Profit: 4500, Category: 'Electronics' },
  ];
  return {
    data,
    meta: { fields: ['Month', 'Region', 'Sales', 'Profit', 'Category'] },
  };
};