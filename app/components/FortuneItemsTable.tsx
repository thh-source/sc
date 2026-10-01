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

  // Keep refs to latest state to use inside onChange without causing re-renders
  const latestQuotes = useRef(quotes);
  const latestVisibleItems = useRef(visibleItems);
  const latestCustomColumns = useRef(customColumns);
  
  useEffect(() => {
    latestQuotes.current = quotes;
    latestVisibleItems.current = visibleItems;
    latestCustomColumns.current = customColumns;
  }, [quotes, visibleItems, customColumns]);

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
      row.push({ v: isPO ? '☑' : '☐', m: isPO ? '☑' : '☐' });
      row.push({ v: index + 1, m: String(index + 1) });
      
      BASE_COLUMNS.forEach(def => {
        if (def.key !== 'stt') {
          const val = valueOf(item, def.key, index) ?? '';
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
      id: "sheet_1",
      name: "Báo giá",
      data: data,
      config: {
        columnlen: { 0: 60, 1: 40, 2: 120 }
      }
    }];
  // Only recreate the sheet if the structure changes (number of items, suppliers, custom columns)
  // We omit `quotes` so that typing inside the sheet doesn't reset the sheet!
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.map((i: any) => i.id).join(','), suppliers.length, customColumns?.length, poSelections]);

  const onChange = (data: any[]) => {
    const sheet = data[0];
    if (!sheet || !sheet.data) return;
    
    for (let r = 1; r < sheet.data.length; r++) {
      const row = sheet.data[r];
      const item = latestVisibleItems.current[r - 1];
      if (!row || !item) continue;
      
      // PO checkbox handling
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
          if (val !== undefined) {
             const strVal = String(val || '');
             const strOldVal = String(oldVal || '');
             if (strVal !== strOldVal && def.key !== 'amount') {
                itemChange(item.id, def.key, strVal);
             }
          }
          colIdx++;
        }
      });
      
      suppliers.forEach((s: Supplier) => {
        const q = latestQuotes.current[item.id]?.[s.id] || { price: 0, vatRate: 0, note: '', custom: {} };
        let qChanged = false;
        const newQ = { ...q, custom: { ...(q.custom || {}) } };
        
        // Price
        let cell = row[colIdx++];
        let val = cell ? cell.v : '';
        if (val !== undefined) {
          const numVal = val === '' ? 0 : Number(val);
          if (numVal !== (Number(q.price) || 0)) {
            newQ.price = numVal;
            qChanged = true;
          }
        }
        
        // Note
        cell = row[colIdx++];
        val = cell ? cell.v : '';
        if (val !== undefined) {
          const strVal = String(val || '');
          if (strVal !== String(q.note || '')) {
            newQ.note = strVal;
            qChanged = true;
          }
        }
        
        // Custom
        (latestCustomColumns.current || []).forEach((cc: string) => {
          cell = row[colIdx++];
          val = cell ? cell.v : '';
          if (val !== undefined) {
            const strVal = String(val || '');
            if (strVal !== String(q.custom?.[cc] || '')) {
              newQ.custom[cc] = strVal;
              qChanged = true;
            }
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
