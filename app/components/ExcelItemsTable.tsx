import React, { useMemo } from 'react';
import { DataGrid, Column, renderTextEditor } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { Item, Supplier, Quote } from '../types';
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
  togglePOItem,
  poSelections,
}: any) {
  
  const columns = useMemo(() => {
    const cols: Column<any>[] = [
      { 
        key: 'po', 
        name: 'Lên PO', 
        width: 60, 
        frozen: true,
        renderCell: (props: any) => (
          <input 
            type="checkbox" 
            checked={!!props.row.po} 
            onChange={(e) => {
              if (togglePOItem) togglePOItem(props.row.id);
            }}
          />
        )
      },
      { key: 'id', name: 'STT', width: 60, frozen: true },
    ];

    order.forEach((colKey: string) => {
      const def = BASE_COLUMNS.find(c => c.key === colKey);
      if (def) {
        cols.push({
          key: def.key,
          name: def.label,
          width: def.key === 'name' ? 200 : 120,
          renderEditCell: renderTextEditor,
        });
      }
    });

    suppliers.forEach((s: Supplier) => {
      cols.push({
        key: `price_${s.id}`,
        name: `Giá (${s.shortName})`,
        width: 120,
        renderEditCell: renderTextEditor,
      });
      cols.push({
        key: `note_${s.id}`,
        name: `Ghi chú (${s.shortName})`,
        width: 150,
        renderEditCell: renderTextEditor,
      });
      (customColumns || []).forEach((cc: string) => {
        cols.push({
          key: `cc_${s.id}_${cc}`,
          name: `${cc} (${s.shortName})`,
          width: 120,
          renderEditCell: renderTextEditor,
        });
      });
    });

    return cols;
  }, [order, suppliers, customColumns]);

  const rows = useMemo(() => {
    return visibleItems.map((item: Item) => {
      const row: any = { ...item };
      row.po = poSelections?.some((s: any) => s.itemId === item.id) || false;
      suppliers.forEach((s: Supplier) => {
        const q = quotes[item.id]?.[s.id];
        row[`price_${s.id}`] = q?.price || '';
        row[`note_${s.id}`] = q?.note || '';
        (customColumns || []).forEach((cc: string) => {
           row[`cc_${s.id}_${cc}`] = q?.custom?.[cc] || '';
        });
      });
      return row;
    });
  }, [visibleItems, suppliers, quotes, customColumns, poSelections]);

  const handleRowsChange = (newRows: any[], { indexes, column }: any) => {
     const index = indexes[0];
     if (index === undefined) return;
     const row = newRows[index];
     const originalItem = visibleItems[index];

     if (column.key.startsWith('price_') || column.key.startsWith('note_') || column.key.startsWith('cc_')) {
        const parts = column.key.split('_');
        const supplierId = Number(parts[1]);
        
        const q = quotes[originalItem.id]?.[supplierId] || { price: 0, vatRate: 0, note: '', custom: {} };
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
