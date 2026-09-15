const PCM_SETTINGS={active:false,data:null,error:null,loading:false};

const pcmFmtBytes=n=>{n=Number(n||0);if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(2)} GB`};
const pcmEsc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
const pcmDateTime=v=>v?new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'Chưa có';

function pcmFindHost(){
  return document.querySelector('.content')||document.querySelector('.workspace-host');
}

function pcmInjectSettingsNav(){
  const sidebar=document.querySelector('.primary-sidebar');
  if(!sidebar)return;
  const oldBackup=sidebar.querySelector('#backupBtn');
  if(oldBackup)oldBackup.style.display='none';
  if(sidebar.querySelector('#pcmSettingsBtn'))return;
  const btn=document.createElement('button');
  btn.className='navbtn';btn.id='pcmSettingsBtn';
  btn.innerHTML='<span class="navicon">⚙</span>Cài đặt';
  const foot=sidebar.querySelector('.sidebar-foot');
  sidebar.insertBefore(btn,foot||null);
  btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();pcmOpenSettings()});
}

async function pcmFetchJson(url){
  const r=await fetch(url,{headers:{accept:'application/json'}});
  if(!r.ok){let msg=`HTTP ${r.status}`;try{const e=await r.json();msg=e.error||msg}catch{}throw new Error(msg)}
  return r.json();
}

function pcmNormalizeDocuments(raw){
  if(Array.isArray(raw))return raw;
  if(Array.isArray(raw?.documents))return raw.documents;
  if(Array.isArray(raw?.items))return raw.items;
  return [];
}

async function pcmLoadStorage(force=false){
  if(PCM_SETTINGS.loading)return;
  if(PCM_SETTINGS.data&&!force){pcmRenderSettings();return}
  PCM_SETTINGS.loading=true;PCM_SETTINGS.error=null;pcmRenderSettings();
  try{
    const [backup,docsRaw]=await Promise.all([pcmFetchJson('/api/du-an/backup'),pcmFetchJson('/api/du-an/documents')]);
    const backupText=JSON.stringify(backup);
    const d1Bytes=new Blob([backupText]).size;
    const tables=Object.entries(backup||{}).filter(([,v])=>Array.isArray(v)).map(([name,rows])=>({name,count:rows.length})).sort((a,b)=>b.count-a.count);
    const docs=pcmNormalizeDocuments(docsRaw);
    const r2Bytes=docs.reduce((s,x)=>s+Number(x.file_size??x.size??0),0);
    const largest=[...docs].sort((a,b)=>Number(b.file_size??b.size??0)-Number(a.file_size??a.size??0)).slice(0,10);
    PCM_SETTINGS.data={d1Bytes,tables,totalRows:tables.reduce((s,x)=>s+x.count,0),r2Bytes,r2Files:docs.length,largest,loadedAt:new Date().toISOString()};
  }catch(err){PCM_SETTINGS.error=err instanceof Error?err.message:String(err)}
  finally{PCM_SETTINGS.loading=false;pcmRenderSettings()}
}

function pcmDownloadBackup(){
  const a=document.createElement('a');a.href='/api/du-an/backup';a.download=`pcm-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();
  localStorage.setItem('pcm.lastBackupAt',new Date().toISOString());
  setTimeout(pcmRenderSettings,150);
}

function pcmExportStorageCSV(){
  const d=PCM_SETTINGS.data;if(!d)return;
  const rows=[['Khu vực','Tên','Số bản ghi / file','Dung lượng'],['D1','Tổng dữ liệu logic',d.totalRows,d.d1Bytes],['R2','File đang được PCM quản lý',d.r2Files,d.r2Bytes],...d.tables.map(t=>['D1',t.name,t.count,'']),...d.largest.map(f=>['R2',f.file_name||f.name||f.title||f.id,1,Number(f.file_size??f.size??0)])];
  const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`pcm-storage-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

function pcmRenderSettings(){
  if(!PCM_SETTINGS.active)return;
  const host=pcmFindHost();if(!host)return;
  const d=PCM_SETTINGS.data,lastBackup=localStorage.getItem('pcm.lastBackupAt');
  document.querySelectorAll('.primary-sidebar .navbtn').forEach(x=>x.classList.toggle('active',x.id==='pcmSettingsBtn'));
  host.innerHTML=`<section class="pcm-settings-page">
    <div class="pcm-settings-head">
      <div><div class="eyebrow">HỆ THỐNG</div><h2>Cài đặt Dự án</h2><p>Quản lý dung lượng dữ liệu, chứng từ và sao lưu hệ thống tại một nơi.</p></div>
      <div class="pcm-settings-actions"><button class="btn" id="pcmRefreshStorage">↻ Làm mới</button><button class="btn primary" id="pcmBackupNow">⇩ Sao lưu ngay</button></div>
    </div>
    ${PCM_SETTINGS.error?`<div class="pcm-settings-error"><b>Không đọc được thông tin dung lượng</b><span>${pcmEsc(PCM_SETTINGS.error)}</span></div>`:''}
    ${PCM_SETTINGS.loading?'<div class="pcm-settings-loading">Đang đọc D1 và danh mục file R2…</div>':d?`
    <div class="usage-grid pcm-storage-grid">
      <article>
        <div><b>Dữ liệu D1</b><small>${d.totalRows.toLocaleString('vi-VN')} bản ghi · ${d.tables.length} bảng</small></div>
        <strong>${pcmFmtBytes(d.d1Bytes)}</strong>
        <div class="usage-bar"><i style="width: 100%"></i></div>
        <footer><span>Sao lưu cục bộ JSON</span></footer>
      </article>
      <article>
        <div><b>File R2 đang quản lý</b><small>${d.r2Files.toLocaleString('vi-VN')} file có metadata trong PCM</small></div>
        <strong>${pcmFmtBytes(d.r2Bytes)}</strong>
        <div class="usage-bar"><i style="width: 100%; background: linear-gradient(90deg, #1672f3, #438cf3)"></i></div>
        <footer><span>Binary files trên R2</span></footer>
      </article>
      <article>
        <div><b>Lịch sử sao lưu thiết bị</b><small>Backup gồm dữ liệu nghiệp vụ D1 và metadata file</small></div>
        <strong style="color: #6b7a8e; font-size: 18px">${lastBackup?pcmDateTime(lastBackup):'Chưa có'}</strong>
        <p style="margin: 0; margin-top: 10px; font-size: 11px">Lưu ý: binary R2 không nhúng vào JSON.</p>
      </article>
    </div>
    
    <div class="pcm-settings-columns">
      <article class="pcm-settings-panel">
        <div class="pcm-panel-head"><div><h3>Chi tiết D1</h3><p>Ước tính dung lượng logic dựa trên file backup JSON, dùng để theo dõi xu hướng tăng dữ liệu.</p></div><button class="btn small" id="pcmExportStorage">Xuất CSV</button></div>
        <div class="pcm-table">${d.tables.map(t=>`<div class="pcm-table-row"><span>${pcmEsc(t.name)}</span><b>${t.count.toLocaleString('vi-VN')}</b><small>bản ghi</small></div>`).join('')||'<div class="empty">Chưa có dữ liệu.</div>'}</div>
      </article>
      <article class="pcm-settings-panel">
        <div class="pcm-panel-head"><div><h3>File R2 lớn nhất</h3><p>Top file đang được PCM theo dõi qua metadata chứng từ.</p></div><button class="btn small" id="pcmOpenDocs">Mở Chứng từ</button></div>
        <div class="pcm-table">${d.largest.map((f,i)=>`<div class="pcm-table-row file"><span><i>${i+1}</i>${pcmEsc(f.file_name||f.name||f.title||'Không tên')}</span><b>${pcmFmtBytes(Number(f.file_size??f.size??0))}</b><small>${pcmEsc(f.document_type||f.type||'')}</small></div>`).join('')||'<div class="empty">Chưa có file R2 được ghi nhận.</div>'}</div>
      </article>
    </div>
    <div class="usage-note"><b>Lưu ý về số liệu dung lượng:</b> D1 ở đây là kích thước dữ liệu logic khi xuất backup, không phải số byte vật lý Cloudflare tính cước. R2 là tổng dung lượng các file có metadata trong PCM; file orphan hoặc file ngoài ứng dụng sẽ không xuất hiện. Vì vậy màn này dùng để quản trị nội bộ và phát hiện tăng dung lượng bất thường, không thay thế số liệu Billing của Cloudflare.</div>
    <div class="pcm-settings-foot">Cập nhật: ${pcmDateTime(d.loadedAt)}</div>`:'<div class="empty">Chưa có dữ liệu dung lượng.</div>'}
  </section>`;
  document.querySelector('#pcmRefreshStorage')?.addEventListener('click',()=>pcmLoadStorage(true));
  document.querySelector('#pcmBackupNow')?.addEventListener('click',pcmDownloadBackup);
  document.querySelector('#pcmBackupNow2')?.addEventListener('click',pcmDownloadBackup);
  document.querySelector('#pcmExportStorage')?.addEventListener('click',pcmExportStorageCSV);
  document.querySelector('#pcmOpenDocs')?.addEventListener('click',()=>{PCM_SETTINGS.active=false;document.querySelector('[data-page="documents"]')?.click()});
}

function pcmOpenSettings(){
  PCM_SETTINGS.active=true;
  pcmRenderSettings();
  pcmLoadStorage();
}

/* Leave Settings before the core app handles navigation. This prevents the
   Settings observer from restoring the page after another tab has rendered. */
document.addEventListener('click',e=>{
  if(!PCM_SETTINGS.active)return;
  const nav=e.target.closest?.('[data-page]');
  if(nav)PCM_SETTINGS.active=false;
},true);

const pcmObserver=new MutationObserver(()=>{
  pcmInjectSettingsNav();
  if(PCM_SETTINGS.active){const btn=document.querySelector('#pcmSettingsBtn');if(btn&&!document.querySelector('.pcm-settings-page'))pcmRenderSettings()}
});
pcmObserver.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',pcmInjectSettingsNav);
setTimeout(pcmInjectSettingsNav,0);
