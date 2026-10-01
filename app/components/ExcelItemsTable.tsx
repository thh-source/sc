import React, { useMemo } from 'react';
import { DataGrid, Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { Item, Supplier, Quote, POSelection } from '../types';
import { BASE_COLUMNS, valueOf } from '../utils';

export function ExcelItemsTable({
  items,
  visibleItems,
  order,
  suppliers,
  quotes,
  itemChange,
  quoteChange,
  best,
  customColumns,
}: any) {
  
  const columns = useMemo(() => {
    const cols: Column<any>[] = [
      { key: 'po', name: 'Lên PO', width: 60, frozen: true },
      { key: 'id', name: 'STT', width: 60, frozen: true },
    ];

    order.forEach((colKey: string) => {
      const def = BASE_COLUMNS.find(c => c.key === colKey);
      if (def) {
        cols.push({
          key: def.key,
          name: def.label,
          width: def.key === 'name' ? 200 : 120,
          editable: true,
        });
      }
    });

    suppliers.forEach((s: Supplier) => {
      cols.push({
        key: `price_${s.id}`,
        name: `Giá (${s.shortName})`,
        width: 120,
        editable: true,
      });
      cols.push({
        key: `note_${s.id}`,
        name: `Ghi chú (${s.shortName})`,
        width: 150,
        editable: true,
      });
      (customColumns || []).forEach((cc: string) => {
        cols.push({
          key: `cc_${s.id}_${cc}`,
          name: `${cc} (${s.shortName})`,
          width: 120,
          editable: true,
        });
      });
    });

    return cols;
  }, [order, suppliers, customColumns]);

  const rows = useMemo(() => {
    return visibleItems.map((item: Item) => {
      const row: any = { ...item };
      suppliers.forEach((s: Supplier) => {
        const q = quotes[s.id]?.[item.id];
        row[`price_${s.id}`] = q?.price || '';
        row[`note_${s.id}`] = q?.note || '';
        (customColumns || []).forEach((cc: string) => {
           row[`cc_${s.id}_${cc}`] = q?.custom?.[cc] || '';
        });
      });
      return row;
    });
  }, [visibleItems, suppliers, quotes, customColumns]);

  const handleRowsChange = (newRows: any[], { indexes, column }: any) => {
     const index = indexes[0];
     if (index === undefined) return;
     const row = newRows[index];
     const originalItem = visibleItems[index];

     if (column.key.startsWith('price_') || column.key.startsWith('note_') || column.key.startsWith('cc_')) {
        const parts = column.key.split('_');
        const supplierId = parts[1];
        
        const q = quotes[supplierId]?.[originalItem.id] || { price: 0, vatRate: 0, note: '', custom: {} };
        const newQ = { ...q };
        
        if (parts[0] === 'price') newQ.price = Number(row[column.key]) || 0;
        if (parts[0] === 'note') newQ.note = row[column.key];
        if (parts[0] === 'cc') {
           const ccName = parts.slice(2).join('_');
           newQ.custom = { ...newQ.custom, [ccName]: row[column.key] };
        }
        
        quoteChange(supplierId, originalItem.id, newQ);
     } else {
        itemChange(originalItem.id, column.key, row[column.key]);
     }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', background: '#e0f2fe', color: '#0284c7', fontSize: '14px', fontWeight: 'bold' }}>
        Chế độ Excel (Thử nghiệm) - Hỗ trợ thao tác bằng phím mũi tên, copy/paste, chỉnh sửa trực tiếp.
      </div>
      <DataGrid 
        columns={columns} 
        rows={rows} 
        onRowsChange={handleRowsChange}
        style={{ flex: 1, height: '100%' }}
        className="rdg-light"
      />
    </div>
  );
}
