import baseWorker from './scda-worker-base.js';

let vatSchemaPromise=null;
const clampVat=v=>Math.max(0,Math.min(100,Number(v||0)));
const num=v=>Number(v||0);
const safeJson=v=>{try{return JSON.stringify(v??null)}catch{return null}};

async function ensureItemVatSchema(env){
  if(vatSchemaPromise)return vatSchemaPromise;
  vatSchemaPromise=(async()=>{
    const info=await env.PCM_DB.prepare('PRAGMA table_info(contract_items)').all();
    const hasVat=(info.results||[]).some(x=>x.name==='vat_rate');
    if(!hasVat){
      let added=false;
      try{await env.PCM_DB.prepare('ALTER TABLE contract_items ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0').run();added=true}
      catch(err){if(!String(err?.message||err).toLowerCase().includes('duplicate column'))throw err}
      if(added)await env.PCM_DB.prepare(`UPDATE contract_items
        SET vat_rate=COALESCE((SELECT c.vat_rate FROM contracts c WHERE c.id=contract_items.contract_id),0)`).run();
    }
  })();
  try{return await vatSchemaPromise}catch(err){vatSchemaPromise=null;throw err}
}

async function parseJson(request){try{return await request.clone().json()}catch{return {}}}

async function refreshContract(request,env,ctx,contractId){
  const url=new URL(request.url);url.pathname='/api/du-an/contracts/'+encodeURIComponent(contractId);url.search='';
  return baseWorker.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
}

async function auditItem(env,request,action,itemId,contractId,summary,before,after){
  try{
    const actor=request.headers.get('cf-access-authenticated-user-email')||request.headers.get('x-user-email')||'anonymous';
    await env.PCM_DB.prepare(`INSERT INTO audit_logs(id,actor,action,entity_type,entity_id,contract_id,summary,before_json,after_json)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(
        `aud_${crypto.randomUUID()}`,actor,action,'item',itemId,contractId,summary,safeJson(before),safeJson(after)
      ).run();
  }catch(err){console.warn('item VAT audit failed',err?.message||err)}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const accessRequired=String(env.REQUIRE_ACCESS||'false').toLowerCase()==='true';
    const hasAccess=!!request.headers.get('cf-access-authenticated-user-email');
    if(accessRequired&&!hasAccess)return baseWorker.fetch(request,env,ctx);
    if(path.startsWith('/api/du-an/'))await ensureItemVatSchema(env);

    const createMatch=path.match(/^\/api\/du-an\/contracts\/([^/]+)\/items$/);
    if(createMatch&&method==='POST'){
      const contractId=createMatch[1],b=await parseJson(request),id=`ite_${crypto.randomUUID()}`;
      const quantity=Math.max(0,num(b.quantity)),unitPrice=Math.max(0,num(b.unit_price)),amount=quantity*unitPrice,vatRate=clampVat(b.vat_rate);
      await env.PCM_DB.prepare(`INSERT INTO contract_items(id,contract_id,item_code,name,specification,unit,quantity,unit_price,amount,vat_rate,note,sort_order)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id,contractId,b.item_code||'',b.name||'',b.specification||'',b.unit||'',quantity,unitPrice,amount,vatRate,b.note||'',num(b.sort_order)
        ).run();
      const detail=await refreshContract(request,env,ctx,contractId);
      const after=await env.PCM_DB.prepare('SELECT * FROM contract_items WHERE id=?').bind(id).first();
      await auditItem(env,request,'create',id,contractId,`Thêm hàng hóa ${after?.name||''} · VAT ${vatRate}%`,null,after);
      return detail;
    }

    const updateMatch=path.match(/^\/api\/du-an\/items\/([^/]+)$/);
    if(updateMatch&&method==='PUT'){
      const itemId=updateMatch[1],b=await parseJson(request),before=await env.PCM_DB.prepare('SELECT * FROM contract_items WHERE id=?').bind(itemId).first();
      if(!before)return new Response(JSON.stringify({error:'Không tìm thấy dữ liệu'}),{status:404,headers:{'content-type':'application/json; charset=utf-8'}});
      const quantity=Math.max(0,num(b.quantity)),unitPrice=Math.max(0,num(b.unit_price)),amount=quantity*unitPrice,vatRate=clampVat(b.vat_rate);
      await env.PCM_DB.prepare(`UPDATE contract_items SET item_code=?,name=?,specification=?,unit=?,quantity=?,unit_price=?,amount=?,vat_rate=?,note=?,sort_order=? WHERE id=?`).bind(
        b.item_code||'',b.name||'',b.specification||'',b.unit||'',quantity,unitPrice,amount,vatRate,b.note||'',num(b.sort_order),itemId
      ).run();
      const detail=await refreshContract(request,env,ctx,before.contract_id);
      const after=await env.PCM_DB.prepare('SELECT * FROM contract_items WHERE id=?').bind(itemId).first();
      await auditItem(env,request,'update',itemId,before.contract_id,`Cập nhật hàng hóa ${after?.name||''} · VAT ${vatRate}%`,before,after);
      return detail;
    }

    return baseWorker.fetch(request,env,ctx);
  }
};
