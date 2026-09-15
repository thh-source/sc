const PCM_ITEM_VAT={editItemId:'',scheduled:false,contractPromise:null,contractId:''};

const pcmVatContractId=()=>document.querySelector('.ws-contract-row.active[data-wscontract]')?.dataset.wscontract||'';
const pcmVatNum=v=>Math.max(0,Number(v||0));
const pcmVatRate=v=>Math.max(0,Math.min(100,Number(v||0)));
const pcmVatMoney=(n,currency='VND')=>{
  const value=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(Number(n||0));
  return currency==='VND'?value+' ₫':value+' '+currency;
};

async function pcmVatGetContract(force=false){
  const id=pcmVatContractId();
  if(!id)return null;
  if(force||PCM_ITEM_VAT.contractId!==id||!PCM_ITEM_VAT.contractPromise){
    PCM_ITEM_VAT.contractId=id;
    PCM_ITEM_VAT.contractPromise=fetch('/api/du-an/contracts/'+encodeURIComponent(id)).then(async r=>{
      if(!r.ok)throw new Error('Không tải được VAT mặt hàng');
      return r.json();
    }).catch(err=>{PCM_ITEM_VAT.contractPromise=null;throw err});
  }
  return PCM_ITEM_VAT.contractPromise;
}

function pcmVatPreview(form,currency='VND'){
  const qty=form.querySelector('[name="quantity"]'),price=form.querySelector('[name="unit_price"]'),vat=form.querySelector('[name="vat_rate"]'),box=form.querySelector('.pcm-vat-preview');
  if(!qty||!price||!vat||!box)return;
  const before=pcmVatNum(qty.value)*pcmVatNum(price.value),rate=pcmVatRate(vat.value),tax=before*rate/100,after=before+tax;
  box.innerHTML=`<span><small>Trước VAT</small><b>${pcmVatMoney(before,currency)}</b></span><span><small>VAT ${rate}%</small><b>${pcmVatMoney(tax,currency)}</b></span><span><small>Sau VAT</small><b>${pcmVatMoney(after,currency)}</b></span>`;
}

async function pcmEnhanceItemModal(){
  const form=document.querySelector('#modalForm');
  if(!form||form.dataset.pcmVat==='1'||!form.querySelector('[name="item_code"]')||!form.querySelector('[name="quantity"]')||!form.querySelector('[name="unit_price"]'))return;
  form.dataset.pcmVat='1';
  const grid=form.querySelector('.formgrid');if(!grid)return;
  const row=document.createElement('div');row.className='formrow pcm-vat-field';row.innerHTML='<label>VAT (%)</label><input class="field" name="vat_rate" type="number" min="0" max="100" step="0.01" list="pcmVatRates" value="0"><datalist id="pcmVatRates"><option value="0"><option value="5"><option value="8"><option value="10"></datalist>';
  const note=grid.querySelector('[name="note"]')?.closest('.formrow');grid.insertBefore(row,note||null);
  const preview=document.createElement('div');preview.className='pcm-vat-preview span2';grid.insertBefore(preview,note||null);
  const vat=row.querySelector('[name="vat_rate"]');let touched=false;vat.addEventListener('input',()=>{touched=true;pcmVatPreview(form,form.dataset.pcmCurrency||'VND')});
  form.querySelector('[name="quantity"]')?.addEventListener('input',()=>pcmVatPreview(form,form.dataset.pcmCurrency||'VND'));
  form.querySelector('[name="unit_price"]')?.addEventListener('input',()=>pcmVatPreview(form,form.dataset.pcmCurrency||'VND'));
  try{
    const c=await pcmVatGetContract();if(!c||!document.body.contains(form))return;
    form.dataset.pcmCurrency=c.currency||'VND';
    const item=PCM_ITEM_VAT.editItemId?(c.items||[]).find(x=>x.id===PCM_ITEM_VAT.editItemId):null;
    if(!touched)vat.value=String(item?.vat_rate??c.vat_rate??0);
    pcmVatPreview(form,c.currency||'VND');
  }catch{pcmVatPreview(form,'VND')}
}

async function pcmEnhanceItemsTable(){
  const tables=[...document.querySelectorAll('.workspace-main table.table,.workspace-content table.table')];
  const table=tables.find(t=>{const h=[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim());return h.includes('SL HĐ')&&h.includes('Đơn giá')&&h.includes('Thành tiền')});
  if(!table||table.dataset.pcmVat==='1')return;
  table.dataset.pcmVat='loading';
  try{
    const c=await pcmVatGetContract(true);if(!c||!document.body.contains(table)){return}
    const headers=[...table.querySelectorAll('thead th')],amountTh=headers.find(x=>x.textContent.trim()==='Thành tiền');if(!amountTh)return;
    amountTh.textContent='Trước VAT';
    const vatTh=document.createElement('th');vatTh.textContent='VAT';
    const afterTh=document.createElement('th');afterTh.textContent='Sau VAT';
    amountTh.after(vatTh,afterTh);
    const byId=new Map((c.items||[]).map(x=>[x.id,x]));
    table.querySelectorAll('tbody tr').forEach(tr=>{
      const edit=tr.querySelector('[data-edititem]');
      if(!edit){const cell=tr.querySelector('td[colspan]');if(cell)cell.colSpan=Number(cell.colSpan||12)+2;return}
      const item=byId.get(edit.dataset.edititem);if(!item)return;
      const amountCell=[...tr.children][10];if(!amountCell)return;
      const before=pcmVatNum(item.amount??pcmVatNum(item.quantity)*pcmVatNum(item.unit_price)),rate=pcmVatRate(item.vat_rate),tax=before*rate/100,after=before+tax;
      const vatTd=document.createElement('td');vatTd.className='pcm-vat-cell';vatTd.innerHTML=`<b>${rate}%</b><small>${pcmVatMoney(tax,c.currency||'VND')}</small>`;
      const afterTd=document.createElement('td');afterTd.className='pcm-after-vat-cell';afterTd.innerHTML=`<b>${pcmVatMoney(after,c.currency||'VND')}</b>`;
      amountCell.after(vatTd,afterTd);
    });
    if((c.items||[]).length){
      const before=(c.items||[]).reduce((s,x)=>s+pcmVatNum(x.amount??pcmVatNum(x.quantity)*pcmVatNum(x.unit_price)),0);
      const tax=(c.items||[]).reduce((s,x)=>{const a=pcmVatNum(x.amount??pcmVatNum(x.quantity)*pcmVatNum(x.unit_price));return s+a*pcmVatRate(x.vat_rate)/100},0);
      const foot=document.createElement('tfoot');foot.innerHTML=`<tr class="pcm-vat-total"><td colspan="10">Tổng giá trị hàng hóa</td><td><b>${pcmVatMoney(before,c.currency||'VND')}</b></td><td><b>${pcmVatMoney(tax,c.currency||'VND')}</b></td><td><b>${pcmVatMoney(before+tax,c.currency||'VND')}</b></td><td></td></tr>`;table.appendChild(foot);
    }
    table.dataset.pcmVat='1';
  }catch{table.dataset.pcmVat=''}
}

function pcmScheduleItemVat(){
  if(PCM_ITEM_VAT.scheduled)return;PCM_ITEM_VAT.scheduled=true;
  requestAnimationFrame(()=>{PCM_ITEM_VAT.scheduled=false;pcmEnhanceItemModal();pcmEnhanceItemsTable()});
}

document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edititem]'),add=e.target.closest('#addItem');
  if(edit){PCM_ITEM_VAT.editItemId=edit.dataset.edititem||'';PCM_ITEM_VAT.contractPromise=null}
  if(add){PCM_ITEM_VAT.editItemId='';PCM_ITEM_VAT.contractPromise=null}
},true);
document.addEventListener('submit',e=>{if(e.target?.id==='modalForm'&&e.target.querySelector('[name="vat_rate"]')){PCM_ITEM_VAT.contractPromise=null;setTimeout(pcmScheduleItemVat,450)}},true);
const pcmItemVatObserver=new MutationObserver(pcmScheduleItemVat);pcmItemVatObserver.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',pcmScheduleItemVat);setTimeout(pcmScheduleItemVat,0);
