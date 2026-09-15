const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'same-origin',
  'x-frame-options':'DENY',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};
const secureResponse=response=>{const h=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))h.set(k,v);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h})};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const uid=(p='id')=>`${p}_${crypto.randomUUID()}`;
const BUSINESS_TZ_OFFSET_HOURS=7;
const todayISO=()=>new Date(Date.now()+BUSINESS_TZ_OFFSET_HOURS*3600000).toISOString().slice(0,10);
const q=async(db,sql,params=[])=>db.prepare(sql).bind(...params).all();
const one=async(db,sql,params=[])=>db.prepare(sql).bind(...params).first();
const exec=async(db,sql,params=[])=>db.prepare(sql).bind(...params).run();
async function body(request){try{return await request.json()}catch{return {}}}
const num=v=>Number(v||0);
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v||0)));
const PAYMENT_DOCS={guarantee:'Bảo lãnh',invoice:'Invoice',packing_list:'Packing list',dq:'DQ',co:'CO',cq:'CQ',document_handover:'Document handover',insurance:'Bảo hiểm'};
const accessActor=request=>request.headers.get('cf-access-authenticated-user-email')||request.headers.get('x-user-email')||'anonymous';
const accessEmail=request=>request.headers.get('cf-access-authenticated-user-email')||'';
const safeJson=v=>{try{return JSON.stringify(v??null)}catch{return null}};
let runtimeSchemaPromise=null;
async function ensureRuntimeSchema(db){
  if(runtimeSchemaPromise)return runtimeSchemaPromise;
  runtimeSchemaPromise=(async()=>{
    const statements=[
      `CREATE TABLE IF NOT EXISTS payment_requirement_documents (
        id TEXT PRIMARY KEY,
        requirement_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(requirement_id) REFERENCES payment_requirements(id) ON DELETE CASCADE,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(requirement_id, document_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_payment_requirement_documents_requirement ON payment_requirement_documents(requirement_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payment_requirement_documents_document ON payment_requirement_documents(document_id)`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL DEFAULT 'anonymous',
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        contract_id TEXT,
        summary TEXT DEFAULT '',
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_contract ON audit_logs(contract_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC)`
    ];
    for(const sql of statements)await db.prepare(sql).run();
  })();
  try{return await runtimeSchemaPromise}catch(e){runtimeSchemaPromise=null;throw e}
}
async function audit(env,request,action,entityType,entityId='',contractId='',summary='',before=null,after=null){
  try{await exec(env.PCM_DB,`INSERT INTO audit_logs(id,actor,action,entity_type,entity_id,contract_id,summary,before_json,after_json) VALUES(?,?,?,?,?,?,?,?,?)`,[uid('aud'),accessActor(request),action,entityType,entityId||null,contractId||null,summary||'',safeJson(before),safeJson(after)])}catch(e){console.warn('audit failed',e?.message||e)}
}
const healthMeta=x=>{let score=100;score-=20*num(x.late_deliveries);score-=15*num(x.overdue_payments);score-=10*num(x.missing_payment_docs);score-=15*num(x.lc_expired);if(num(x.document_count)===0)score-=5;score=clamp(score);return {health_score:score,health_label:score>=85?'Tốt':score>=65?'Cần chú ý':'Rủi ro',health_status:score>=85?'good':score>=65?'attention':'risk'}};
const supplierMeta=x=>{const done=num(x.completed_deliveries),ontime=num(x.on_time_deliveries),rate=done?clamp(ontime/done*100):100;let score=100-8*num(x.late_deliveries)-5*num(x.overdue_payments);if(done&&rate<80)score-=10;score=clamp(score);return {on_time_rate:rate,performance_score:score,performance_label:score>=85?'Tốt':score>=65?'Cần chú ý':'Rủi ro'}};
const lcReadyStatus=s=>['opened','completed'].includes(String(s||''));
function enrichPayment(pm){
  const total=num(pm.required_doc_count),got=num(pm.received_doc_count),missing=Math.max(0,total-got),useLc=num(pm.contract_use_lc||pm.use_lc),lcStatus=pm.contract_lc_status||pm.lc_status||'not_required';
  const expiry=pm.contract_lc_expiry_date||pm.lc_expiry_date||'';
  const lcExpired=!!(useLc&&expiry&&expiry<todayISO()&&lcStatus!=='completed');
  let condition='ready';
  if(pm.status==='paid')condition='paid';
  else if(missing>0)condition='missing_docs';
  else if(lcExpired)condition='lc_expired';
  else if(useLc&&!lcReadyStatus(lcStatus))condition='waiting_lc';
  pm.missing_doc_count=missing;pm.payment_condition=condition;pm.payment_ready=condition==='ready'?1:0;pm.lc_expired=lcExpired?1:0;
  return pm;
}
async function syncPaymentRequirements(db,paymentId,rows=[]){
  const input=Array.isArray(rows)?rows:[],existing=(await q(db,`SELECT * FROM payment_requirements WHERE payment_id=?`,[paymentId])).results||[];
  const byId=new Map(existing.map(x=>[x.id,x])),byCode=new Map(existing.map(x=>[x.document_code,x])),kept=[];
  const payment=await one(db,`SELECT contract_id FROM payments WHERE id=?`,[paymentId]);if(!payment)return;
  const seen=new Set();
  for(const x of input){
    const standard=PAYMENT_DOCS[x.code],label=String(standard||x.label||'').trim();if(!label)continue;
    const code=standard?x.code:String(x.code||`custom_${label.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||crypto.randomUUID()}`);
    const uniq=(standard?'s:':'c:')+(standard?code:label.toLowerCase());if(seen.has(uniq))continue;seen.add(uniq);
    let prev=(x.id&&byId.get(String(x.id)))||byCode.get(code);const id=prev?.id||uid('preq');
    if(prev)await exec(db,`UPDATE payment_requirements SET document_code=?,document_label=?,received=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_id=?`,[code,label,x.received?1:0,x.note||'',id,paymentId]);
    else await exec(db,`INSERT INTO payment_requirements(id,payment_id,document_code,document_label,received,note) VALUES(?,?,?,?,?,?)`,[id,paymentId,code,label,x.received?1:0,x.note||'']);
    kept.push(id);
    const wanted=[...new Set((Array.isArray(x.document_ids)?x.document_ids:[]).map(String).filter(Boolean))],valid=[];
    for(const docId of wanted){const doc=await one(db,`SELECT d.id FROM documents d WHERE d.id=? AND d.contract_id=?`,[docId,payment.contract_id]);if(doc)valid.push(docId)}
    const stm=[db.prepare(`DELETE FROM payment_requirement_documents WHERE requirement_id=?`).bind(id),...valid.map(docId=>db.prepare(`INSERT INTO payment_requirement_documents(id,requirement_id,document_id) VALUES(?,?,?)`).bind(uid('prd'),id,docId))];await db.batch(stm);
  }
  const obsolete=existing.filter(x=>!kept.includes(x.id));for(const x of obsolete)await exec(db,`DELETE FROM payment_requirements WHERE id=?`,[x.id]);
}
async function listContracts(env,url){
  const search=(url.searchParams.get('search')||'').trim(),project=url.searchParams.get('project')||'',status=url.searchParams.get('status')||'',supplier=url.searchParams.get('supplier')||'';
  const clauses=[`c.status!='deleted'`],params=[];
  if(search){clauses.push(`(c.contract_no LIKE ? OR c.name LIKE ? OR s.name LIKE ? OR p.name LIKE ?)`);const x=`%${search}%`;params.push(x,x,x,x)}
  if(project){clauses.push(`c.project_id=?`);params.push(project)}if(status){clauses.push(`c.status=?`);params.push(status)}if(supplier){clauses.push(`c.supplier_id=?`);params.push(supplier)}
  const r=await q(env.PCM_DB,`SELECT c.*,p.name project_name,s.name supplier_name,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE contract_id=c.id AND status='paid') paid_amount,
    (SELECT COUNT(*) FROM documents WHERE contract_id=c.id) document_count,
    (SELECT COUNT(*) FROM deliveries d WHERE d.contract_id=c.id AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours')) late_deliveries,
    (SELECT COUNT(*) FROM deliveries d WHERE d.contract_id=c.id AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+7 day')) soon_deliveries,
    (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours')) overdue_payments,
    (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+7 day')) soon_payments,
    (SELECT COUNT(*) FROM payment_requirements pr JOIN payments pm ON pm.id=pr.payment_id WHERE pm.contract_id=c.id AND pr.received=0 AND NOT EXISTS(SELECT 1 FROM payment_requirement_documents prd WHERE prd.requirement_id=pr.id)) missing_payment_docs,
    CASE WHEN c.lc_mode!='none' AND c.lc_status!='completed' AND c.lc_expiry_date IS NOT NULL AND date(c.lc_expiry_date)<date('now','+7 hours') THEN 1 ELSE 0 END lc_expired
    FROM contracts c JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE ${clauses.join(' AND ')} ORDER BY COALESCE(c.signed_date,c.created_at) DESC,c.created_at DESC`,params);
  return (r.results||[]).map(x=>Object.assign(x,healthMeta(x)));
}
async function listSuppliers(env){
  const r=await q(env.PCM_DB,`SELECT s.*,
    (SELECT COUNT(*) FROM contracts c WHERE c.supplier_id=s.id AND c.status!='deleted') contract_count,
    (SELECT COUNT(*) FROM contracts c WHERE c.supplier_id=s.id AND c.status='done') completed_contracts,
    (SELECT COUNT(DISTINCT c.project_id) FROM contracts c WHERE c.supplier_id=s.id AND c.status!='deleted') project_count,
    (SELECT COALESCE(SUM(value_after_vat),0) FROM contracts c WHERE c.supplier_id=s.id AND c.status!='deleted') contract_value,
    (SELECT COUNT(*) FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.supplier_id=s.id AND c.status!='deleted') total_deliveries,
    (SELECT COUNT(*) FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.supplier_id=s.id AND c.status!='deleted' AND d.status='done') completed_deliveries,
    (SELECT COUNT(*) FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.supplier_id=s.id AND c.status!='deleted' AND d.status='done' AND d.actual_date IS NOT NULL AND d.planned_date IS NOT NULL AND date(d.actual_date)<=date(d.planned_date)) on_time_deliveries,
    (SELECT COUNT(*) FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.supplier_id=s.id AND c.status!='deleted' AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours')) late_deliveries,
    (SELECT COUNT(*) FROM payments pm JOIN contracts c ON c.id=pm.contract_id WHERE c.supplier_id=s.id AND c.status!='deleted' AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours')) overdue_payments
    FROM suppliers s ORDER BY s.name`);
  return (r.results||[]).map(x=>Object.assign(x,supplierMeta(x)));
}
async function supplierDetail(env,id){const suppliers=await listSuppliers(env),supplier=suppliers.find(x=>x.id===id);if(!supplier)return null;const url=new URL('https://pcm.local/api/du-an/contracts');url.searchParams.set('supplier',id);const contracts=await listContracts(env,url);return {supplier,contracts}}
async function listDeliveries(env){const r=await q(env.PCM_DB,`SELECT d.*,c.contract_no,c.name contract_name,c.supplier_id,p.name project_name,s.name supplier_name,CASE WHEN d.status='done' THEN 'done' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status,(SELECT COUNT(*) FROM delivery_items di WHERE di.delivery_id=d.id AND di.planned_quantity>0) item_count,(SELECT COALESCE(SUM(planned_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) planned_quantity,(SELECT COALESCE(SUM(received_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) received_quantity FROM deliveries d JOIN contracts c ON c.id=d.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' ORDER BY CASE computed_status WHEN 'late' THEN 1 WHEN 'soon' THEN 2 WHEN 'future' THEN 3 ELSE 4 END,d.planned_date`);return r.results||[]}
async function listDocuments(env){const r=await q(env.PCM_DB,`SELECT d.*,c.contract_no,c.name contract_name,c.supplier_id,p.name project_name,s.name supplier_name FROM documents d JOIN contracts c ON c.id=d.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' ORDER BY d.uploaded_at DESC,d.id DESC`);return r.results||[]}
async function listPayments(env){
  const r=await q(env.PCM_DB,`SELECT pm.*,c.contract_no,c.name contract_name,c.supplier_id,c.lc_mode,c.lc_percent,c.lc_status contract_lc_status,c.lc_no contract_lc_no,c.lc_open_date contract_lc_open_date,c.lc_expiry_date contract_lc_expiry_date,p.name project_name,s.name supplier_name,
    CASE WHEN EXISTS(SELECT 1 FROM contract_lc_payments clp WHERE clp.contract_id=c.id AND clp.payment_id=pm.id) THEN 1 ELSE 0 END contract_use_lc,
    CASE WHEN pm.status='paid' THEN 'paid' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours') THEN 'overdue' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status,
    (SELECT COUNT(*) FROM payment_requirements pr WHERE pr.payment_id=pm.id) required_doc_count,
    (SELECT COUNT(*) FROM payment_requirements pr WHERE pr.payment_id=pm.id AND (pr.received=1 OR EXISTS(SELECT 1 FROM payment_requirement_documents prd WHERE prd.requirement_id=pr.id))) received_doc_count,
    (SELECT COUNT(*) FROM payment_requirement_documents prd JOIN payment_requirements pr ON pr.id=prd.requirement_id WHERE pr.payment_id=pm.id) linked_file_count
    FROM payments pm JOIN contracts c ON c.id=pm.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' ORDER BY CASE computed_status WHEN 'overdue' THEN 1 WHEN 'soon' THEN 2 WHEN 'future' THEN 3 ELSE 4 END,pm.due_date`);
  return (r.results||[]).map(enrichPayment);
}
async function contractDetail(env,id){
  const c=await one(env.PCM_DB,`SELECT c.*,p.name project_name,s.name supplier_name FROM contracts c JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.id=? AND c.status!='deleted'`,[id]);if(!c)return null;
  const [items,deliveries,payments,documents,deliveryItems,paymentRequirements,requirementDocs,lcPayments,audits]=await Promise.all([
    q(env.PCM_DB,`SELECT ci.*,(SELECT COALESCE(SUM(di.planned_quantity),0) FROM delivery_items di WHERE di.contract_item_id=ci.id) allocated_quantity,(SELECT COALESCE(SUM(di.received_quantity),0) FROM delivery_items di WHERE di.contract_item_id=ci.id) received_quantity FROM contract_items ci WHERE ci.contract_id=? ORDER BY ci.sort_order,ci.id`,[id]),
    q(env.PCM_DB,`SELECT d.*,CASE WHEN status='done' THEN 'done' WHEN planned_date IS NOT NULL AND date(planned_date)<date('now','+7 hours') THEN 'late' WHEN planned_date IS NOT NULL AND date(planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status,(SELECT COUNT(*) FROM delivery_items di WHERE di.delivery_id=d.id AND di.planned_quantity>0) item_count,(SELECT COALESCE(SUM(planned_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) planned_quantity,(SELECT COALESCE(SUM(received_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) received_quantity FROM deliveries d WHERE contract_id=? ORDER BY planned_date,id`,[id]),
    q(env.PCM_DB,`SELECT *,CASE WHEN status='paid' THEN 'paid' WHEN due_date IS NOT NULL AND date(due_date)<date('now','+7 hours') THEN 'overdue' WHEN due_date IS NOT NULL AND date(due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status FROM payments WHERE contract_id=? ORDER BY due_date,id`,[id]),
    q(env.PCM_DB,`SELECT * FROM documents WHERE contract_id=? ORDER BY uploaded_at DESC`,[id]),
    q(env.PCM_DB,`SELECT di.*,ci.item_code,ci.name item_name,ci.unit,ci.quantity contract_quantity FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id JOIN contract_items ci ON ci.id=di.contract_item_id WHERE d.contract_id=? ORDER BY d.planned_date,ci.sort_order,ci.id`,[id]),
    q(env.PCM_DB,`SELECT pr.* FROM payment_requirements pr JOIN payments pm ON pm.id=pr.payment_id WHERE pm.contract_id=? ORDER BY pr.document_label`,[id]),
    q(env.PCM_DB,`SELECT prd.requirement_id,d.id document_id,d.file_name,d.category,d.size,d.uploaded_at FROM payment_requirement_documents prd JOIN payment_requirements pr ON pr.id=prd.requirement_id JOIN payments pm ON pm.id=pr.payment_id JOIN documents d ON d.id=prd.document_id WHERE pm.contract_id=? ORDER BY d.uploaded_at DESC`,[id]),
    q(env.PCM_DB,`SELECT payment_id FROM contract_lc_payments WHERE contract_id=?`,[id]),
    q(env.PCM_DB,`SELECT id,actor,action,entity_type,entity_id,summary,created_at FROM audit_logs WHERE contract_id=? ORDER BY created_at DESC LIMIT 30`,[id])
  ]);
  const byDelivery=new Map();for(const x of deliveryItems.results||[]){if(!byDelivery.has(x.delivery_id))byDelivery.set(x.delivery_id,[]);byDelivery.get(x.delivery_id).push(x)}
  const deliveryRows=deliveries.results||[];for(const d of deliveryRows)d.items=byDelivery.get(d.id)||[];
  const docsByReq=new Map();for(const x of requirementDocs.results||[]){if(!docsByReq.has(x.requirement_id))docsByReq.set(x.requirement_id,[]);docsByReq.get(x.requirement_id).push({id:x.document_id,file_name:x.file_name,category:x.category,size:x.size,uploaded_at:x.uploaded_at})}
  const reqs=paymentRequirements.results||[];for(const r of reqs){r.documents=docsByReq.get(r.id)||[];r.document_ids=r.documents.map(d=>d.id);r.satisfied=Number(r.received)===1||r.documents.length>0?1:0}
  const lcSet=new Set((lcPayments.results||[]).map(x=>x.payment_id));
  const paymentRows=payments.results||[];for(const pm of paymentRows){pm.requirements=reqs.filter(x=>x.payment_id===pm.id);pm.required_doc_count=pm.requirements.length;pm.received_doc_count=pm.requirements.filter(x=>x.satisfied).length;pm.contract_use_lc=lcSet.has(pm.id)?1:0;pm.use_lc=pm.contract_use_lc;pm.contract_lc_status=c.lc_status||'not_required';pm.contract_lc_no=c.lc_no||'';pm.contract_lc_open_date=c.lc_open_date||null;pm.contract_lc_expiry_date=c.lc_expiry_date||null;enrichPayment(pm)}
  c.lc_payment_ids=[...lcSet];c.lc_amount=num(c.value_after_vat)*num(c.lc_percent)/100;
  const meta=healthMeta({late_deliveries:deliveryRows.filter(x=>x.computed_status==='late').length,overdue_payments:paymentRows.filter(x=>x.computed_status==='overdue').length,missing_payment_docs:paymentRows.reduce((a,x)=>a+num(x.missing_doc_count),0),lc_expired:c.lc_mode!=='none'&&c.lc_status!=='completed'&&c.lc_expiry_date&&c.lc_expiry_date<todayISO()?1:0,document_count:(documents.results||[]).length});Object.assign(c,meta);
  return {...c,items:items.results||[],deliveries:deliveryRows,payments:paymentRows,documents:documents.results||[],audit_logs:audits.results||[]};
}
async function dashboard(env){
  const db=env.PCM_DB;
  const projects=await one(db,`SELECT COUNT(*) count FROM projects WHERE status!='deleted'`),contracts=await one(db,`SELECT COUNT(*) count,COALESCE(SUM(value_after_vat),0) total FROM contracts WHERE status!='deleted'`),paid=await one(db,`SELECT COALESCE(SUM(p.amount),0) total FROM payments p JOIN contracts c ON c.id=p.contract_id WHERE p.status='paid' AND c.status!='deleted'`);
  const dueSoon=await one(db,`SELECT COUNT(*) count,COALESCE(SUM(p.amount),0) total FROM payments p JOIN contracts c ON c.id=p.contract_id WHERE c.status!='deleted' AND p.status!='paid' AND p.due_date IS NOT NULL AND date(p.due_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+7 day')`),overduePayments=await one(db,`SELECT COUNT(*) count,COALESCE(SUM(p.amount),0) total FROM payments p JOIN contracts c ON c.id=p.contract_id WHERE c.status!='deleted' AND p.status!='paid' AND p.due_date IS NOT NULL AND date(p.due_date)<date('now','+7 hours')`),lateDelivery=await one(db,`SELECT COUNT(*) count FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.status!='deleted' AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours')`);
  const deliverySummary=await q(db,`SELECT CASE WHEN d.status='done' THEN 'done' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END bucket,COUNT(*) count FROM deliveries d JOIN contracts c ON c.id=d.contract_id WHERE c.status!='deleted' GROUP BY bucket`),paymentSummary=await q(db,`SELECT CASE WHEN p.status='paid' THEN 'paid' WHEN p.due_date IS NOT NULL AND date(p.due_date)<date('now','+7 hours') THEN 'overdue' WHEN p.due_date IS NOT NULL AND date(p.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END bucket,COUNT(*) count,COALESCE(SUM(p.amount),0) total FROM payments p JOIN contracts c ON c.id=p.contract_id WHERE c.status!='deleted' GROUP BY bucket`);
  const projectValues=await q(db,`SELECT p.id,p.name,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN c.value_after_vat ELSE 0 END),0) total FROM projects p LEFT JOIN contracts c ON c.project_id=p.id WHERE p.status!='deleted' GROUP BY p.id,p.name ORDER BY total DESC LIMIT 8`);
  const projectHealth=await q(db,`SELECT p.id,p.name,COUNT(DISTINCT CASE WHEN c.status!='deleted' THEN c.id END) contract_count,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN c.value_after_vat ELSE 0 END),0) contract_value,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN (SELECT COALESCE(SUM(pm.amount),0) FROM payments pm WHERE pm.contract_id=c.id AND pm.status='paid') ELSE 0 END),0) paid_amount,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN (SELECT COALESCE(SUM(ci.quantity),0) FROM contract_items ci WHERE ci.contract_id=c.id) ELSE 0 END),0) total_quantity,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN (SELECT COALESCE(SUM(di.received_quantity),0) FROM delivery_items di JOIN deliveries dd ON dd.id=di.delivery_id WHERE dd.contract_id=c.id) ELSE 0 END),0) received_quantity,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN (SELECT COUNT(*) FROM deliveries dd WHERE dd.contract_id=c.id AND dd.status!='done' AND dd.planned_date IS NOT NULL AND date(dd.planned_date)<date('now','+7 hours')) ELSE 0 END),0) late_deliveries,COALESCE(SUM(CASE WHEN c.status!='deleted' THEN (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours')) ELSE 0 END),0) overdue_payments FROM projects p LEFT JOIN contracts c ON c.project_id=p.id WHERE p.status!='deleted' GROUP BY p.id,p.name ORDER BY (late_deliveries+overdue_payments) DESC,contract_value DESC LIMIT 6`);
  const baseActions=(await q(db,`SELECT * FROM (SELECT d.contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name,'delivery' kind,d.title,d.planned_date due_date,0 amount,CASE WHEN date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END status FROM deliveries d JOIN contracts c ON c.id=d.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<=date('now','+7 hours','+14 day') UNION ALL SELECT pm.contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name,'payment' kind,pm.title,pm.due_date,pm.amount,CASE WHEN date(pm.due_date)<date('now','+7 hours') THEN 'overdue' WHEN date(pm.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END status FROM payments pm JOIN contracts c ON c.id=pm.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<=date('now','+7 hours','+14 day')) ORDER BY date(due_date) LIMIT 20`)).results||[];
  const missing=(await q(db,`SELECT pm.contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name,'payment_docs' kind,pm.title,pm.due_date,pm.amount,'missing_docs' status,COUNT(*) missing_count FROM payment_requirements pr JOIN payments pm ON pm.id=pr.payment_id JOIN contracts c ON c.id=pm.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND pm.status!='paid' AND pr.received=0 AND NOT EXISTS(SELECT 1 FROM payment_requirement_documents prd WHERE prd.requirement_id=pr.id) GROUP BY pm.id HAVING COUNT(*)>0 LIMIT 20`)).results||[];
  const lcIssues=(await q(db,`SELECT c.id contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name,'lc' kind,'LC hợp đồng' title,c.lc_expiry_date due_date,c.value_after_vat*c.lc_percent/100 amount,CASE WHEN c.lc_expiry_date IS NOT NULL AND date(c.lc_expiry_date)<date('now','+7 hours') AND c.lc_status!='completed' THEN 'lc_expired' ELSE 'waiting_lc' END status FROM contracts c JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND c.lc_mode!='none' AND ((c.lc_expiry_date IS NOT NULL AND date(c.lc_expiry_date)<date('now','+7 hours') AND c.lc_status!='completed') OR c.lc_status NOT IN ('opened','completed')) LIMIT 20`)).results||[];
  const missingContractDocs=(await q(db,`SELECT c.id contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name,'document' kind,'Hợp đồng chưa có chứng từ' title,NULL due_date,0 amount,'missing_contract_docs' status FROM contracts c JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status='active' AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.contract_id=c.id) LIMIT 10`)).results||[];
  const rank={late:0,overdue:0,lc_expired:0,missing_docs:1,waiting_lc:1,soon:2,missing_contract_docs:3,future:4};const actions=[...baseActions,...missing,...lcIssues,...missingContractDocs].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,14);
  const upcoming=await q(db,`SELECT * FROM (SELECT d.contract_id,c.contract_no,p.name project_name,'delivery' kind,d.title,d.planned_date event_date,0 amount,CASE WHEN d.status='done' THEN 'done' WHEN date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END status FROM deliveries d JOIN contracts c ON c.id=d.contract_id JOIN projects p ON p.id=c.project_id WHERE c.status!='deleted' AND d.planned_date IS NOT NULL AND date(d.planned_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+30 day') UNION ALL SELECT pm.contract_id,c.contract_no,p.name project_name,'payment' kind,pm.title,pm.due_date event_date,pm.amount,CASE WHEN pm.status='paid' THEN 'paid' WHEN date(pm.due_date)<date('now','+7 hours') THEN 'overdue' WHEN date(pm.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END status FROM payments pm JOIN contracts c ON c.id=pm.contract_id JOIN projects p ON p.id=c.project_id WHERE c.status!='deleted' AND pm.due_date IS NOT NULL AND date(pm.due_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+30 day')) ORDER BY date(event_date) LIMIT 18`);
  const allContracts=await listContracts(env,new URL('https://pcm.local/api/du-an/contracts')),riskContracts=[...allContracts].sort((a,b)=>a.health_score-b.health_score||num(b.value_after_vat)-num(a.value_after_vat)).slice(0,6);
  return {projects:projects?.count||0,contracts:contracts?.count||0,contractValue:contracts?.total||0,paid:paid?.total||0,dueSoon:dueSoon||{count:0,total:0},overduePayments:overduePayments||{count:0,total:0},lateDelivery:lateDelivery?.count||0,deliverySummary:deliverySummary.results||[],paymentSummary:paymentSummary.results||[],projectValues:projectValues.results||[],projectHealth:projectHealth.results||[],riskContracts,actions,upcoming:upcoming.results||[]};
}

async function projectTimeline(env,id){
  const db=env.PCM_DB;
  const project=await one(db,`SELECT * FROM projects WHERE id=? AND status!='deleted'`,[id]);
  if(!project)return null;
  const contracts=(await q(db,`SELECT c.*,s.name supplier_name,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE contract_id=c.id AND status='paid') paid_amount,
    (SELECT COALESCE(SUM(quantity),0) FROM contract_items WHERE contract_id=c.id) total_quantity,
    (SELECT COALESCE(SUM(di.received_quantity),0) FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id WHERE d.contract_id=c.id) received_quantity,
    (SELECT COUNT(*) FROM deliveries d WHERE d.contract_id=c.id AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours')) late_deliveries,
    (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours')) overdue_payments
    FROM contracts c LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.project_id=? AND c.status!='deleted' ORDER BY COALESCE(c.start_date,c.signed_date,c.created_at),c.contract_no`,[id])).results||[];
  if(!contracts.length)return {project,contracts:[],events:[],stats:{contracts:0,total_value:0,paid:0,late_deliveries:0,overdue_payments:0}};
  const ids=contracts.map(x=>x.id),marks=ids.map(()=>'?').join(',');
  const deliveries=(await q(db,`SELECT d.*,CASE WHEN d.status='done' THEN 'done' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status,(SELECT COALESCE(SUM(planned_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) planned_quantity,(SELECT COALESCE(SUM(received_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) received_quantity FROM deliveries d WHERE d.contract_id IN (${marks}) ORDER BY d.planned_date`,ids)).results||[];
  const payments=(await q(db,`SELECT pm.*,CASE WHEN pm.status='paid' THEN 'paid' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours') THEN 'overdue' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status FROM payments pm WHERE pm.contract_id IN (${marks}) ORDER BY pm.due_date`,ids)).results||[];
  const events=[];
  for(const c of contracts){
    if(c.signed_date)events.push({contract_id:c.id,kind:'contract',date:c.signed_date,title:'Ký hợp đồng',status:'blue'});
    if(c.lc_mode&&c.lc_mode!=='none'&&c.lc_open_date)events.push({contract_id:c.id,kind:'lc',date:c.lc_open_date,title:'Mở LC',status:['opened','completed'].includes(c.lc_status)?'done':'future',amount:num(c.value_after_vat)*num(c.lc_percent)/100});
    if(c.lc_mode&&c.lc_mode!=='none'&&c.lc_expiry_date)events.push({contract_id:c.id,kind:'lc',date:c.lc_expiry_date,title:'Hết hạn LC',status:c.lc_status==='completed'?'done':c.lc_expiry_date<todayISO()?'late':'future',amount:num(c.value_after_vat)*num(c.lc_percent)/100});
    if(c.end_date)events.push({contract_id:c.id,kind:'contract_end',date:c.end_date,title:'Kết thúc dự kiến',status:c.status==='done'?'done':'future'});
  }
  for(const d of deliveries)if(d.planned_date)events.push({contract_id:d.contract_id,kind:'delivery',id:d.id,date:d.planned_date,title:d.title||'Giao hàng',status:d.computed_status,planned_quantity:d.planned_quantity,received_quantity:d.received_quantity});
  for(const pm of payments)if(pm.due_date)events.push({contract_id:pm.contract_id,kind:'payment',id:pm.id,date:pm.due_date,title:pm.title||'Thanh toán',status:pm.computed_status,amount:pm.amount,percent:pm.percent});
  const stats={contracts:contracts.length,total_value:contracts.reduce((a,x)=>a+num(x.value_after_vat),0),paid:contracts.reduce((a,x)=>a+num(x.paid_amount),0),late_deliveries:contracts.reduce((a,x)=>a+num(x.late_deliveries),0),overdue_payments:contracts.reduce((a,x)=>a+num(x.overdue_payments),0)};
  return {project,contracts,events,stats};
}


async function projectOverview(env,id){
  const db=env.PCM_DB;
  const project=await one(db,`SELECT * FROM projects WHERE id=? AND status!='deleted'`,[id]);
  if(!project)return null;
  const contracts=(await q(db,`SELECT c.*,s.name supplier_name,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE contract_id=c.id AND status='paid') paid_amount,
    (SELECT COALESCE(SUM(quantity),0) FROM contract_items WHERE contract_id=c.id) total_quantity,
    (SELECT COALESCE(SUM(di.received_quantity),0) FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id WHERE d.contract_id=c.id) received_quantity,
    (SELECT COUNT(*) FROM deliveries d WHERE d.contract_id=c.id AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours')) late_deliveries,
    (SELECT COUNT(*) FROM deliveries d WHERE d.contract_id=c.id AND d.status!='done' AND d.planned_date IS NOT NULL AND date(d.planned_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+7 day')) soon_deliveries,
    (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours')) overdue_payments,
    (SELECT COUNT(*) FROM payments pm WHERE pm.contract_id=c.id AND pm.status!='paid' AND pm.due_date IS NOT NULL AND date(pm.due_date) BETWEEN date('now','+7 hours') AND date('now','+7 hours','+7 day')) soon_payments,
    (SELECT COUNT(*) FROM documents d WHERE d.contract_id=c.id) document_count,
    (SELECT COUNT(*) FROM payment_requirements pr JOIN payments pm ON pm.id=pr.payment_id WHERE pm.contract_id=c.id AND pr.received=0 AND NOT EXISTS(SELECT 1 FROM payment_requirement_documents prd WHERE prd.requirement_id=pr.id)) missing_payment_docs,
    CASE WHEN c.lc_mode!='none' AND c.lc_status!='completed' AND c.lc_expiry_date IS NOT NULL AND date(c.lc_expiry_date)<date('now','+7 hours') THEN 1 ELSE 0 END lc_expired
    FROM contracts c LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.project_id=? AND c.status!='deleted' ORDER BY COALESCE(c.signed_date,c.created_at) DESC`,[id])).results||[];
  for(const c of contracts)Object.assign(c,healthMeta(c));
  const totalValue=contracts.reduce((a,x)=>a+num(x.value_after_vat),0),paid=contracts.reduce((a,x)=>a+num(x.paid_amount),0);
  const totalQty=contracts.reduce((a,x)=>a+num(x.total_quantity),0),receivedQty=contracts.reduce((a,x)=>a+num(x.received_quantity),0);
  const deliveries=(await q(db,`SELECT d.*,c.contract_no,c.name contract_name,s.name supplier_name,CASE WHEN d.status='done' THEN 'done' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<date('now','+7 hours') THEN 'late' WHEN d.planned_date IS NOT NULL AND date(d.planned_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status,(SELECT COALESCE(SUM(planned_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) planned_quantity,(SELECT COALESCE(SUM(received_quantity),0) FROM delivery_items di WHERE di.delivery_id=d.id) received_quantity FROM deliveries d JOIN contracts c ON c.id=d.contract_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.project_id=? AND c.status!='deleted' ORDER BY d.planned_date`,[id])).results||[];
  const payments=(await q(db,`SELECT pm.*,c.contract_no,c.name contract_name,s.name supplier_name,CASE WHEN pm.status='paid' THEN 'paid' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<date('now','+7 hours') THEN 'overdue' WHEN pm.due_date IS NOT NULL AND date(pm.due_date)<=date('now','+7 hours','+7 day') THEN 'soon' ELSE 'future' END computed_status FROM payments pm JOIN contracts c ON c.id=pm.contract_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.project_id=? AND c.status!='deleted' ORDER BY pm.due_date`,[id])).results||[];
  const actionItems=[
    ...deliveries.filter(x=>['late','soon'].includes(x.computed_status)).map(x=>({kind:'delivery',status:x.computed_status,date:x.planned_date,contract_id:x.contract_id,contract_no:x.contract_no,title:x.title||'Mốc giao hàng',supplier_name:x.supplier_name||'',value:num(x.planned_quantity),received:num(x.received_quantity)})),
    ...payments.filter(x=>['overdue','soon'].includes(x.computed_status)).map(x=>({kind:'payment',status:x.computed_status,date:x.due_date,contract_id:x.contract_id,contract_no:x.contract_no,title:x.title||'Đợt thanh toán',supplier_name:x.supplier_name||'',value:num(x.amount),received:0}))
  ].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  const supplierMap=new Map();
  for(const c of contracts){const k=c.supplier_name||'Chưa chọn NCC',x=supplierMap.get(k)||{supplier_name:k,contracts:0,value:0,late_deliveries:0,overdue_payments:0,soon:0};x.contracts++;x.value+=num(c.value_after_vat);x.late_deliveries+=num(c.late_deliveries);x.overdue_payments+=num(c.overdue_payments);x.soon+=num(c.soon_deliveries)+num(c.soon_payments);supplierMap.set(k,x)}
  const suppliers=[...supplierMap.values()].sort((a,b)=>(b.late_deliveries+b.overdue_payments)-(a.late_deliveries+a.overdue_payments)||b.value-a.value);
  const stats={contracts:contracts.length,total_value:totalValue,paid,unpaid:Math.max(0,totalValue-paid),payment_progress:totalValue?paid/totalValue*100:0,total_quantity:totalQty,received_quantity:receivedQty,delivery_progress:totalQty?receivedQty/totalQty*100:0,late_deliveries:deliveries.filter(x=>x.computed_status==='late').length,soon_deliveries:deliveries.filter(x=>x.computed_status==='soon').length,overdue_payments:payments.filter(x=>x.computed_status==='overdue').length,soon_payments:payments.filter(x=>x.computed_status==='soon').length,documents:contracts.reduce((a,x)=>a+num(x.document_count),0)};
  return {project,stats,contracts,suppliers,action_items:actionItems.slice(0,20)};
}



async function listAudit(env,url){const limit=Math.min(200,Math.max(1,num(url.searchParams.get('limit')||80))),contract=url.searchParams.get('contract')||'';const sql=contract?`SELECT * FROM audit_logs WHERE contract_id=? ORDER BY created_at DESC LIMIT ?`:`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`;const params=contract?[contract,limit]:[limit];return (await q(env.PCM_DB,sql,params)).results||[]}
async function reportSummary(env){
  const url=new URL('https://pcm.local/api/du-an/contracts');const [contracts,payments,suppliers,deliveries,documents,audits]=await Promise.all([listContracts(env,url),listPayments(env),listSuppliers(env),listDeliveries(env),listDocuments(env),listAudit(env,new URL('https://pcm.local/api/du-an/audit?limit=30'))]);
  const missingRequirements=(await q(env.PCM_DB,`SELECT pr.id,pr.document_label,pm.id payment_id,pm.title payment_title,pm.due_date,pm.amount,c.id contract_id,c.contract_no,c.name contract_name,p.name project_name,s.name supplier_name FROM payment_requirements pr JOIN payments pm ON pm.id=pr.payment_id JOIN contracts c ON c.id=pm.contract_id JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND pm.status!='paid' AND pr.received=0 AND NOT EXISTS(SELECT 1 FROM payment_requirement_documents prd WHERE prd.requirement_id=pr.id) ORDER BY pm.due_date,pr.document_label`)).results||[];
  const lc=(await q(env.PCM_DB,`SELECT c.id,c.contract_no,c.name,p.name project_name,s.name supplier_name,c.value_after_vat,c.lc_percent,c.value_after_vat*c.lc_percent/100 lc_amount,c.lc_status,c.lc_no,c.lc_open_date,c.lc_expiry_date,(SELECT COUNT(*) FROM contract_lc_payments clp WHERE clp.contract_id=c.id) payment_count FROM contracts c JOIN projects p ON p.id=c.project_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.status!='deleted' AND c.lc_mode!='none' ORDER BY c.lc_expiry_date,c.contract_no`)).results||[];
  return {generated_at:new Date().toISOString(),contracts,payments,suppliers,deliveries,documents,missingRequirements,lc,audits};
}
async function backupData(env){const tables=['projects','suppliers','contracts','contract_items','deliveries','delivery_items','payments','payment_requirements','payment_requirement_documents','contract_lc_payments','documents','audit_logs'];const out={version:5,exported_at:new Date().toISOString(),tables:{}};for(const t of tables)out.tables[t]=(await q(env.PCM_DB,`SELECT * FROM ${t}`)).results||[];return out}
async function api(request,env,url){
  const path=url.pathname,db=env.PCM_DB,method=request.method;
  if(String(env.REQUIRE_ACCESS||'false').toLowerCase()==='true'&&!accessEmail(request))return json({error:'Yêu cầu đăng nhập Cloudflare Access'},401);
  if(path==='/api/du-an/bootstrap'&&method==='GET'){const [projects,suppliers,contracts,dash]=await Promise.all([q(db,`SELECT * FROM projects WHERE status!='deleted' ORDER BY created_at`),listSuppliers(env),listContracts(env,url),dashboard(env)]);return json({projects:projects.results||[],suppliers,contracts,dashboard:dash,serverDate:todayISO(),security:{actor:accessActor(request),accessProtected:!!accessEmail(request)}})}
  if(path==='/api/du-an/dashboard'&&method==='GET')return json(await dashboard(env));
  if(path==='/api/du-an/contracts'&&method==='GET')return json(await listContracts(env,url));
  if(path==='/api/du-an/suppliers'&&method==='GET')return json(await listSuppliers(env));
  const supplierDetailMatch=path.match(/^\/api\/du-an\/suppliers\/([^/]+)\/detail$/);if(supplierDetailMatch&&method==='GET'){const x=await supplierDetail(env,supplierDetailMatch[1]);return x?json(x):json({error:'Không tìm thấy nhà cung cấp'},404)}
  if(path==='/api/du-an/deliveries'&&method==='GET')return json(await listDeliveries(env));
  if(path==='/api/du-an/payments'&&method==='GET')return json(await listPayments(env));
  if(path==='/api/du-an/documents'&&method==='GET')return json(await listDocuments(env));
  if(path==='/api/du-an/reports/summary'&&method==='GET')return json(await reportSummary(env));
  if(path==='/api/du-an/audit'&&method==='GET')return json(await listAudit(env,url));
  if(path==='/api/du-an/backup'&&method==='GET')return json(await backupData(env),200,{'content-disposition':`attachment; filename="pcm-backup-${todayISO()}.json"`});
  const projectOverviewMatch=path.match(/^\/api\/du-an\/projects\/([^/]+)\/overview$/);if(projectOverviewMatch&&method==='GET'){const x=await projectOverview(env,projectOverviewMatch[1]);return x?json(x):json({error:'Không tìm thấy dự án'},404)}
  const projectTimelineMatch=path.match(/^\/api\/du-an\/projects\/([^/]+)\/timeline$/);if(projectTimelineMatch&&method==='GET'){const x=await projectTimeline(env,projectTimelineMatch[1]);return x?json(x):json({error:'Không tìm thấy dự án'},404)}

  if(path==='/api/du-an/projects'&&method==='POST'){const b=await body(request),id=uid('prj');await exec(db,`INSERT INTO projects(id,code,name,description,status) VALUES(?,?,?,?,?)`,[id,b.code||'',b.name||'Dự án mới',b.description||'',b.status||'active']);const after=await one(db,`SELECT * FROM projects WHERE id=?`,[id]);await audit(env,request,'create','project',id,'',`Tạo dự án ${after?.name||''}`,null,after);return json(after,201)}
  if(/^\/api\/du-an\/projects\/[^/]+$/.test(path)&&method==='PUT'){const id=path.split('/').pop(),before=await one(db,`SELECT * FROM projects WHERE id=?`,[id]),b=await body(request);await exec(db,`UPDATE projects SET code=?,name=?,description=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[b.code||'',b.name||'',b.description||'',b.status||'active',id]);const after=await one(db,`SELECT * FROM projects WHERE id=?`,[id]);await audit(env,request,'update','project',id,'',`Cập nhật dự án ${after?.name||''}`,before,after);return json(after)}
  if(/^\/api\/du-an\/projects\/[^/]+$/.test(path)&&method==='DELETE'){const id=path.split('/').pop(),before=await one(db,`SELECT * FROM projects WHERE id=?`,[id]);await exec(db,`UPDATE projects SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?`,[id]);await exec(db,`UPDATE contracts SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE project_id=?`,[id]);await audit(env,request,'delete','project',id,'',`Xóa dự án ${before?.name||''}`,before,null);return json({ok:true})}

  if(path==='/api/du-an/suppliers'&&method==='POST'){const b=await body(request),id=uid('sup');await exec(db,`INSERT INTO suppliers(id,name,tax_code,contact_name,phone,email,address,note) VALUES(?,?,?,?,?,?,?,?)`,[id,b.name||'Nhà cung cấp mới',b.tax_code||'',b.contact_name||'',b.phone||'',b.email||'',b.address||'',b.note||'']);const after=await one(db,`SELECT * FROM suppliers WHERE id=?`,[id]);await audit(env,request,'create','supplier',id,'',`Tạo NCC ${after?.name||''}`,null,after);return json(after,201)}
  if(/^\/api\/du-an\/suppliers\/[^/]+$/.test(path)&&method==='PUT'){const id=path.split('/').pop(),before=await one(db,`SELECT * FROM suppliers WHERE id=?`,[id]),b=await body(request);await exec(db,`UPDATE suppliers SET name=?,tax_code=?,contact_name=?,phone=?,email=?,address=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[b.name||'',b.tax_code||'',b.contact_name||'',b.phone||'',b.email||'',b.address||'',b.note||'',id]);const after=await one(db,`SELECT * FROM suppliers WHERE id=?`,[id]);await audit(env,request,'update','supplier',id,'',`Cập nhật NCC ${after?.name||''}`,before,after);return json(after)}
  if(/^\/api\/du-an\/suppliers\/[^/]+$/.test(path)&&method==='DELETE'){const id=path.split('/').pop(),before=await one(db,`SELECT * FROM suppliers WHERE id=?`,[id]),used=await one(db,`SELECT COUNT(*) count FROM contracts WHERE supplier_id=? AND status!='deleted'`,[id]);if(used?.count)return json({error:'Nhà cung cấp đang được dùng trong hợp đồng'},409);await exec(db,`DELETE FROM suppliers WHERE id=?`,[id]);await audit(env,request,'delete','supplier',id,'',`Xóa NCC ${before?.name||''}`,before,null);return json({ok:true})}

  if(path==='/api/du-an/contracts'&&method==='POST'){
    const b=await body(request),id=uid('ctr');
    if(!b.project_id)return json({error:'Thiếu dự án'},400);
    let supplier_id = b.supplier_id || null;
    if(!supplier_id && b.supplier_name) {
      const existing = await one(db, `SELECT id FROM suppliers WHERE name=?`, [b.supplier_name]);
      if(existing) supplier_id = existing.id;
      else {
        supplier_id = uid('sup');
        await exec(db, `INSERT INTO suppliers(id,name,tax_code,contact_name,phone,email,address,note) VALUES(?,?,?,?,?,?,?,?)`, [supplier_id, b.supplier_name, '', '', '', '', '', '']);
      }
    }
    await exec(db,`INSERT INTO contracts(id,project_id,supplier_id,contract_no,name,signed_date,start_date,end_date,currency,vat_rate,value_before_vat,value_after_vat,status,note,lc_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,b.project_id,supplier_id,b.contract_no||'',b.name||'Hợp đồng mới',b.signed_date||null,b.signed_date||null,b.end_date||null,b.currency||'VND',num(b.vat_rate),num(b.value_before_vat),num(b.value_after_vat),b.status||'active',b.note||'','none']);
    if (Array.isArray(b.items)) {
      for (const item of b.items) {
        const itemId=uid('ite');
        await exec(db,`INSERT INTO contract_items(id,contract_id,item_code,name,specification,unit,quantity,unit_price,amount,note,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[itemId,id,item.item_code||'',item.name||'',item.specification||'',item.unit||'',num(item.quantity),num(item.unit_price),item.amount==null?num(item.quantity)*num(item.unit_price):num(item.amount),item.note||'',num(item.sort_order)]);
      }
    }
    if (Array.isArray(b.deliveries)) {
      for (const d of b.deliveries) {
        const dId=uid('del');
        await exec(db,`INSERT INTO deliveries(id,contract_id,title,planned_date,actual_date,percent,status,note) VALUES(?,?,?,?,?,?,?,?)`,[dId,id,d.title||'Mốc giao hàng',d.planned_date||null,null,0,'pending','']);
      }
    }
    if (Array.isArray(b.payments)) {
      for (const p of b.payments) {
        const pId=uid('pay');
        await exec(db,`INSERT INTO payments(id,contract_id,title,percent,amount,due_date,paid_date,status,note) VALUES(?,?,?,?,?,?,?,?,?)`,[pId,id,p.title||'Đợt thanh toán',num(p.percent),num(p.amount),p.due_date||null,p.paid_date||null,p.status||'pending',p.note||'']);
        await syncPaymentRequirements(db,pId,p.requirements||[]);
      }
    }
    const after=await contractDetail(env,id);
    await audit(env,request,'create','contract',id,id,`Tạo hợp đồng ${after?.contract_no||''}`,null,after);
    return json(after,201);
  }
  if(/^\/api\/du-an\/contracts\/[^/]+$/.test(path)&&method==='GET'){const x=await contractDetail(env,path.split('/').pop());return x?json(x):json({error:'Not found'},404)}
  if(/^\/api\/du-an\/contracts\/[^/]+$/.test(path)&&method==='PUT'){const id=path.split('/').pop(),before=await contractDetail(env,id),b=await body(request),lcRequired=!!b.lc_required,lcMode=lcRequired?'some':'none',lcPercent=lcRequired?clamp(b.lc_percent):0,lcStatus=lcRequired?(b.lc_status||'preparing'):'not_required';await exec(db,`UPDATE contracts SET project_id=?,supplier_id=?,contract_no=?,name=?,signed_date=?,start_date=?,end_date=?,currency=?,vat_rate=?,value_before_vat=?,value_after_vat=?,status=?,note=?,lc_mode=?,lc_percent=?,lc_status=?,lc_no=?,lc_open_date=?,lc_expiry_date=?,lc_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[b.project_id,b.supplier_id||null,b.contract_no||'',b.name||'',b.signed_date||null,b.start_date||null,b.end_date||null,b.currency||'VND',num(b.vat_rate),num(b.value_before_vat),num(b.value_after_vat),b.status||'active',b.note||'',lcMode,lcPercent,lcStatus,lcRequired?(b.lc_no||''):'',lcRequired?(b.lc_open_date||null):null,lcRequired?(b.lc_expiry_date||null):null,lcRequired?(b.lc_note||''):'',id]);const wanted=lcRequired&&Array.isArray(b.lc_payment_ids)?[...new Set(b.lc_payment_ids.map(String))]:[],valid=[];for(const paymentId of wanted){const pm=await one(db,`SELECT id FROM payments WHERE id=? AND contract_id=?`,[paymentId,id]);if(pm)valid.push(paymentId)}await db.batch([db.prepare(`DELETE FROM contract_lc_payments WHERE contract_id=?`).bind(id),...valid.map(paymentId=>db.prepare(`INSERT INTO contract_lc_payments(id,contract_id,payment_id) VALUES(?,?,?)`).bind(uid('clp'),id,paymentId))]);const after=await contractDetail(env,id);await audit(env,request,'update','contract',id,id,`Cập nhật hợp đồng ${after?.contract_no||''}`,before,after);return json(after)}
  if(/^\/api\/du-an\/contracts\/[^/]+$/.test(path)&&method==='DELETE'){const id=path.split('/').pop(),before=await contractDetail(env,id);await exec(db,`UPDATE contracts SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?`,[id]);await audit(env,request,'delete','contract',id,id,`Xóa hợp đồng ${before?.contract_no||''}`,before,null);return json({ok:true})}

  const child=path.match(/^\/api\/du-an\/contracts\/([^/]+)\/(items|deliveries|payments)$/);
  if(child&&method==='POST'){const [,contractId,type]=child,b=await body(request),id=uid(type.slice(0,3));if(type==='items')await exec(db,`INSERT INTO contract_items(id,contract_id,item_code,name,specification,unit,quantity,unit_price,amount,note,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[id,contractId,b.item_code||'',b.name||'',b.specification||'',b.unit||'',num(b.quantity),num(b.unit_price),b.amount==null?num(b.quantity)*num(b.unit_price):num(b.amount),b.note||'',num(b.sort_order)]);if(type==='deliveries')await exec(db,`INSERT INTO deliveries(id,contract_id,title,planned_date,actual_date,percent,status,note) VALUES(?,?,?,?,?,?,?,?)`,[id,contractId,b.title||'Mốc giao hàng',b.planned_date||null,b.actual_date||null,num(b.percent),b.status||'pending',b.note||'']);if(type==='payments'){await exec(db,`INSERT INTO payments(id,contract_id,title,percent,amount,due_date,paid_date,status,note) VALUES(?,?,?,?,?,?,?,?,?)`,[id,contractId,b.title||'Đợt thanh toán',num(b.percent),num(b.amount),b.due_date||null,b.paid_date||null,b.status||'pending',b.note||'']);await syncPaymentRequirements(db,id,b.requirements||[])}await audit(env,request,'create',type.slice(0,-1),id,contractId,`Thêm ${type==='items'?'hàng hóa':type==='deliveries'?'mốc giao hàng':'đợt thanh toán'} ${b.title||b.name||''}`,null,b);return json(await contractDetail(env,contractId),201)}
  const childItem=path.match(/^\/api\/du-an\/(items|deliveries|payments)\/([^/]+)$/);
  if(childItem&&method==='PUT'){const [,type,id]=childItem,b=await body(request),table={items:'contract_items',deliveries:'deliveries',payments:'payments'}[type],before=await one(db,`SELECT * FROM ${table} WHERE id=?`,[id]);if(!before)return json({error:'Không tìm thấy dữ liệu'},404);const contractId=before.contract_id;if(type==='items')await exec(db,`UPDATE contract_items SET item_code=?,name=?,specification=?,unit=?,quantity=?,unit_price=?,amount=?,note=?,sort_order=? WHERE id=?`,[b.item_code||'',b.name||'',b.specification||'',b.unit||'',num(b.quantity),num(b.unit_price),b.amount==null?num(b.quantity)*num(b.unit_price):num(b.amount),b.note||'',num(b.sort_order),id]);if(type==='deliveries')await exec(db,`UPDATE deliveries SET title=?,planned_date=?,actual_date=?,percent=?,status=?,note=? WHERE id=?`,[b.title||'',b.planned_date||null,b.actual_date||null,num(b.percent),b.status||'pending',b.note||'',id]);if(type==='payments'){await exec(db,`UPDATE payments SET title=?,percent=?,amount=?,due_date=?,paid_date=?,status=?,note=? WHERE id=?`,[b.title||'',num(b.percent),num(b.amount),b.due_date||null,b.paid_date||null,b.status||'pending',b.note||'',id]);await syncPaymentRequirements(db,id,b.requirements||[])}const after=await one(db,`SELECT * FROM ${table} WHERE id=?`,[id]);await audit(env,request,'update',type.slice(0,-1),id,contractId,`Cập nhật ${type==='items'?'hàng hóa':type==='deliveries'?'mốc giao hàng':'đợt thanh toán'} ${after?.title||after?.name||''}`,before,after);return json({ok:true})}
  if(childItem&&method==='PATCH'){const [,type,id]=childItem;if(type==='payments'){const b=await body(request),before=await one(db,`SELECT * FROM payments WHERE id=?`,[id]);if(!before)return json({error:'Not found'},404);await exec(db,`UPDATE payments SET status=?,paid_date=? WHERE id=?`,[b.status||before.status,b.paid_date,id]);const after=await one(db,`SELECT * FROM payments WHERE id=?`,[id]);await audit(env,request,'update','payment',id,before.contract_id,`Cập nhật thanh toán ${after.title}`,before,after);return json({ok:true})}}
  if(childItem&&method==='DELETE'){const [,type,id]=childItem,table={items:'contract_items',deliveries:'deliveries',payments:'payments'}[type],before=await one(db,`SELECT * FROM ${table} WHERE id=?`,[id]);if(before){await exec(db,`DELETE FROM ${table} WHERE id=?`,[id]);await audit(env,request,'delete',type.slice(0,-1),id,before.contract_id,`Xóa ${type==='items'?'hàng hóa':type==='deliveries'?'mốc giao hàng':'đợt thanh toán'} ${before.title||before.name||''}`,before,null)}return json({ok:true})}

  const deliveryAlloc=path.match(/^\/api\/du-an\/deliveries\/([^/]+)\/items$/);
  if(deliveryAlloc&&method==='PUT'){const deliveryId=deliveryAlloc[1],b=await body(request),delivery=await one(db,`SELECT * FROM deliveries WHERE id=?`,[deliveryId]);if(!delivery)return json({error:'Không tìm thấy mốc giao hàng'},404);const rows=Array.isArray(b.items)?b.items:[],valid=[];for(const x of rows){const ci=await one(db,`SELECT id,quantity FROM contract_items WHERE id=? AND contract_id=?`,[x.contract_item_id,delivery.contract_id]);if(!ci)continue;const planned=Math.max(0,num(x.planned_quantity)),received=Math.max(0,num(x.received_quantity)),other=await one(db,`SELECT COALESCE(SUM(di.planned_quantity),0) total FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id WHERE di.contract_item_id=? AND di.delivery_id!=? AND d.contract_id=?`,[x.contract_item_id,deliveryId,delivery.contract_id]);if(planned+num(other?.total)>num(ci.quantity))return json({error:`Tổng số lượng phân bổ của ${x.contract_item_id} vượt số lượng hợp đồng`},400);if(received>planned)return json({error:'Số lượng đã nhận không thể vượt số lượng của đợt giao'},400);if(planned>0||received>0)valid.push({...x,planned,received})}await db.batch([db.prepare(`DELETE FROM delivery_items WHERE delivery_id=?`).bind(deliveryId),...valid.map(x=>db.prepare(`INSERT INTO delivery_items(id,delivery_id,contract_item_id,planned_quantity,received_quantity,note) VALUES(?,?,?,?,?,?)`).bind(uid('dli'),deliveryId,x.contract_item_id,x.planned,x.received,x.note||''))]);const total=valid.reduce((a,x)=>a+x.planned,0),received=valid.reduce((a,x)=>a+x.received,0);if(total>0&&received>=total)await exec(db,`UPDATE deliveries SET status='done',actual_date=COALESCE(actual_date,?) WHERE id=?`,[todayISO(),deliveryId]);else if(delivery.status==='done'&&received<total)await exec(db,`UPDATE deliveries SET status='pending' WHERE id=?`,[deliveryId]);await audit(env,request,'update','delivery_items',deliveryId,delivery.contract_id,`Cập nhật phân bổ hàng cho ${delivery.title||'mốc giao'}`,null,{items:valid});return json(await contractDetail(env,delivery.contract_id))}

  const upload=path.match(/^\/api\/du-an\/contracts\/([^/]+)\/documents$/);
  if(upload&&method==='POST'){const contractId=upload[1],form=await request.formData(),file=form.get('file');if(!(file instanceof File))return json({error:'Thiếu file'},400);if(file.size>50*1024*1024)return json({error:'File vượt quá 50 MB'},413);const id=uid('doc'),safe=file.name.replace(/[\\/]/g,'_'),objectKey=`contracts/${contractId}/${id}-${safe}`;await env.PCM_FILES.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});await exec(db,`INSERT INTO documents(id,contract_id,category,file_name,object_key,content_type,size,note) VALUES(?,?,?,?,?,?,?,?)`,[id,contractId,form.get('category')||'other',file.name,objectKey,file.type||'application/octet-stream',file.size,form.get('note')||'']);await audit(env,request,'upload','document',id,contractId,`Tải chứng từ ${file.name}`,null,{file_name:file.name,category:form.get('category')||'other',size:file.size});return json(await contractDetail(env,contractId),201)}
  const fileGet=path.match(/^\/files\/([^/]+)$/);if(fileGet&&method==='GET'){const doc=await one(db,`SELECT * FROM documents WHERE id=?`,[fileGet[1]]);if(!doc)return new Response('Not found',{status:404});const obj=await env.PCM_FILES.get(doc.object_key);if(!obj)return new Response('Not found',{status:404});const h=new Headers();obj.writeHttpMetadata(h);h.set('etag',obj.httpEtag);h.set('content-disposition',`inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`);return new Response(obj.body,{headers:h})}
  if(/^\/api\/du-an\/documents\/[^/]+$/.test(path)&&method==='DELETE'){const id=path.split('/').pop(),doc=await one(db,`SELECT * FROM documents WHERE id=?`,[id]);if(doc){await env.PCM_FILES.delete(doc.object_key);await exec(db,`DELETE FROM documents WHERE id=?`,[id]);await audit(env,request,'delete','document',id,doc.contract_id,`Xóa chứng từ ${doc.file_name}`,doc,null)}return json({ok:true})}
  return json({error:'API route not found'},404);
}
export default{async fetch(request,env){try{const url=new URL(request.url);let response;if(url.pathname.startsWith('/api/du-an/')||url.pathname.startsWith('/files/')){await ensureRuntimeSchema(env.PCM_DB);response=await api(request,env,url)}else response=await env.ASSETS.fetch(request);return secureResponse(response)}catch(e){return secureResponse(json({error:e?.message||'Internal error'},500))}}};
