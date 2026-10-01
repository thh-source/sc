import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Workbook, WorkbookInstance } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { Item, Supplier, Quote } from '../types';
import { BASE_COLUMNS, valueOf } from '../utils';

export function FortuneItemsTable({
  items,
  visibleItems,
  suppliers,
  quotes,
  itemChange,
  quoteChange,
  best,
  customColumns,
  togglePOItem,
  poSelections,
}: any) {
  const workbookRef = useRef<WorkbookInstance>(null);

  const sheetData = useMemo(() => {
    // 1. Build Header Row
    const headerRow: any[] = [];
    headerRow.push({ v: 'Lên PO', m: 'Lên PO', bg: '#f3f4f6', bl: 1 });
    headerRow.push({ v: 'STT', m: 'STT', bg: '#f3f4f6', bl: 1 });
    BASE_COLUMNS.forEach(def => {
      if (def.key !== 'stt') {
        headerRow.push({ v: def.label, m: def.label, bg: '#f3f4f6', bl: 1 });
      }
    });
    
    suppliers.forEach((s: Supplier) => {
      headerRow.push({ v: `Giá (${s.shortName})`, m: `Giá (${s.shortName})`, bg: '#dbeafe', bl: 1 });
      headerRow.push({ v: `Ghi chú (${s.shortName})`, m: `Ghi chú (${s.shortName})`, bg: '#dbeafe', bl: 1 });
      (customColumns || []).forEach((cc: string) => {
        headerRow.push({ v: `${cc} (${s.shortName})`, m: `${cc} (${s.shortName})`, bg: '#dbeafe', bl: 1 });
      });
    });

    const data: any[][] = [headerRow];

    // 2. Build Item Rows
    visibleItems.forEach((item: Item, index: number) => {
      const row: any[] = [];
      
      const isPO = poSelections?.some((sel: any) => sel.itemId === item.id) || false;
      row.push({ v: isPO ? '☑' : '☐', m: isPO ? '☑' : '☐' }); // Fake checkbox for now
      row.push({ v: index + 1, m: String(index + 1) });
      
      BASE_COLUMNS.forEach(def => {
        if (def.key !== 'stt') {
          const val = valueOf(item, def.key, index);
          row.push({ v: val, m: String(val) });
        }
      });
      
      suppliers.forEach((s: Supplier) => {
        const q = quotes[item.id]?.[s.id];
        row.push({ v: q?.price || '', m: String(q?.price || '') });
        row.push({ v: q?.note || '', m: String(q?.note || '') });
        (customColumns || []).forEach((cc: string) => {
          const ccv = q?.custom?.[cc] || '';
          row.push({ v: ccv, m: String(ccv) });
        });
      });
      
      data.push(row);
    });

    return [{
      name: "Báo giá",
      data: data,
      celldata: [], // Or generate celldata if required
    }];
  }, [visibleItems, suppliers, quotes, customColumns, poSelections]);

  const onChange = (data: any[]) => {
    const sheet = data[0];
    if (!sheet || !sheet.data) return;
    
    for (let r = 1; r < sheet.data.length; r++) {
      const row = sheet.data[r];
      const item = visibleItems[r - 1];
      if (!row || !item) continue;
      
      // PO checkbox handling (optional)
      const poCell = row[0];
      const isPO = poSelections?.some((sel: any) => sel.itemId === item.id) || false;
      const poVal = poCell ? poCell.v : '';
      if ((poVal === '☑' && !isPO) || (poVal === '☐' && isPO)) {
         if (togglePOItem) togglePOItem(item.id);
      }
      
      let colIdx = 2; // skip PO and STT
      
      BASE_COLUMNS.forEach(def => {
        if (def.key !== 'stt') {
          const cell = row[colIdx];
          const val = cell ? cell.v : '';
          const oldVal = valueOf(item, def.key, r - 1);
          if (val !== undefined && String(val) !== String(oldVal) && def.key !== 'amount') {
             itemChange(item.id, def.key, String(val));
          }
          colIdx++;
        }
      });
      
      suppliers.forEach((s: Supplier) => {
        const q = quotes[item.id]?.[s.id] || { price: 0, vatRate: 0, note: '', custom: {} };
        let qChanged = false;
        const newQ = { ...q, custom: { ...q.custom } };
        
        // Price
        let cell = row[colIdx++];
        let val = cell ? cell.v : '';
        if (val !== undefined && Number(val) !== Number(q.price)) {
          newQ.price = Number(val) || 0;
          qChanged = true;
        }
        
        // Note
        cell = row[colIdx++];
        val = cell ? cell.v : '';
        if (val !== undefined && String(val) !== String(q.note)) {
          newQ.note = String(val);
          qChanged = true;
        }
        
        // Custom
        (customColumns || []).forEach((cc: string) => {
          cell = row[colIdx++];
          val = cell ? cell.v : '';
          if (val !== undefined && String(val) !== String(q.custom?.[cc] || '')) {
            newQ.custom[cc] = String(val);
            qChanged = true;
          }
        });
        
        if (qChanged) {
          quoteChange(s.id, item.id, newQ);
        }
      });
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      <Workbook 
        ref={workbookRef} 
        data={sheetData} 
        onChange={onChange}
      />
    </div>
  );
}
