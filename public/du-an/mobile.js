const PCM_MOBILE={moreOpen:false};

const pcmIsMobile=()=>window.matchMedia('(max-width:800px)').matches;
const pcmPageButtons=()=>[...document.querySelectorAll('.primary-sidebar [data-page]')];
const pcmByPage=p=>pcmPageButtons().find(b=>b.dataset.page===p);

function pcmCloseMobileMenu(){
  document.body.classList.remove('pcm-mobile-menu-open');
  PCM_MOBILE.moreOpen=false;
  document.querySelector('.pcm-mobile-more-sheet')?.classList.remove('open');
}

function pcmOpenMobileMenu(){document.body.classList.add('pcm-mobile-menu-open')}

function pcmNavigateMobile(page){const btn=pcmByPage(page);if(btn){btn.click();pcmCloseMobileMenu()}}

function pcmCurrentPage(){
  const active=pcmPageButtons().find(b=>b.classList.contains('active'));
  if(active)return active.dataset.page||'';
  if(document.querySelector('#pcmSettingsBtn.active'))return 'settings';
  return '';
}

function pcmInjectMobileChrome(){
  if(!pcmIsMobile())return;
  const topbar=document.querySelector('.topbar');
  if(topbar&&!topbar.querySelector('.pcm-mobile-menu-btn')){
    const b=document.createElement('button');
    b.type='button';b.className='pcm-mobile-menu-btn';b.setAttribute('aria-label','Mở menu');b.textContent='☰';
    b.onclick=e=>{e.preventDefault();e.stopPropagation();pcmOpenMobileMenu()};
    topbar.insertBefore(b,topbar.firstChild);
  }
  if(!document.querySelector('.pcm-mobile-backdrop')){
    const x=document.createElement('div');x.className='pcm-mobile-backdrop';x.onclick=pcmCloseMobileMenu;document.body.appendChild(x);
  }
  if(!document.querySelector('.pcm-mobile-dock')){
    const dock=document.createElement('nav');dock.className='pcm-mobile-dock';dock.setAttribute('aria-label','Điều hướng nhanh');
    dock.innerHTML=`
      <button data-mobile-page="workspace"><i>⌂</i><span>Workspace</span></button>
      <button data-mobile-page="dashboard"><i>◫</i><span>Dashboard</span></button>
      <button data-mobile-page="contracts"><i>▤</i><span>Hợp đồng</span></button>
      <button data-mobile-page="payments"><i>▧</i><span>Thanh toán</span></button>
      <button data-mobile-more><i>•••</i><span>Thêm</span></button>`;
    document.body.appendChild(dock);
    dock.querySelectorAll('[data-mobile-page]').forEach(b=>b.onclick=()=>pcmNavigateMobile(b.dataset.mobilePage));
    dock.querySelector('[data-mobile-more]').onclick=e=>{e.stopPropagation();PCM_MOBILE.moreOpen=!PCM_MOBILE.moreOpen;pcmBuildMoreSheet(true)};
  }
  pcmBuildMoreSheet(false);
  pcmSyncMobileActive();
}

function pcmBuildMoreSheet(force=false){
  let sheet=document.querySelector('.pcm-mobile-more-sheet');
  if(!sheet){sheet=document.createElement('div');sheet.className='pcm-mobile-more-sheet';document.body.appendChild(sheet);force=true}
  const items=[['projects','Dự án'],['suppliers','Nhà cung cấp'],['deliveries','Leadtime'],['documents','Chứng từ'],['reports','Báo cáo']];
  const hasSettings=!!document.querySelector('#pcmSettingsBtn');
  const signature=hasSettings?'settings-1':'settings-0';
  if(force||sheet.dataset.signature!==signature){
    sheet.dataset.signature=signature;
    sheet.innerHTML=items.map(([p,l])=>`<button data-more-page="${p}">${l}</button>`).join('')+(hasSettings?'<button data-more-settings>⚙ Cài đặt</button>':'')+'<button data-more-menu>☰ Toàn bộ menu</button>';
    sheet.querySelectorAll('[data-more-page]').forEach(b=>b.onclick=()=>pcmNavigateMobile(b.dataset.morePage));
    sheet.querySelector('[data-more-settings]')?.addEventListener('click',()=>{document.querySelector('#pcmSettingsBtn')?.click();PCM_MOBILE.moreOpen=false;sheet.classList.remove('open');setTimeout(pcmSyncMobileActive,20)});
    sheet.querySelector('[data-more-menu]')?.addEventListener('click',()=>{PCM_MOBILE.moreOpen=false;sheet.classList.remove('open');pcmOpenMobileMenu()});
  }
  sheet.classList.toggle('open',PCM_MOBILE.moreOpen);
  pcmSyncMobileActive();
}

function pcmSyncMobileActive(){
  const page=pcmCurrentPage();
  document.querySelectorAll('.pcm-mobile-dock [data-mobile-page]').forEach(b=>b.classList.toggle('active',b.dataset.mobilePage===page));
  const moreActive=['projects','suppliers','deliveries','documents','reports','settings','supplier_detail','project_overview','project_detail'].includes(page);
  document.querySelector('.pcm-mobile-dock [data-mobile-more]')?.classList.toggle('active',moreActive||PCM_MOBILE.moreOpen);
  document.querySelectorAll('.pcm-mobile-more-sheet [data-more-page]').forEach(b=>b.classList.toggle('active',b.dataset.morePage===page));
  document.querySelector('.pcm-mobile-more-sheet [data-more-settings]')?.classList.toggle('active',page==='settings');
}

let pcmMobileScheduled=false;
const pcmMobileObserver=new MutationObserver(()=>{
  if(!pcmIsMobile()||pcmMobileScheduled)return;
  pcmMobileScheduled=true;
  requestAnimationFrame(()=>{pcmMobileScheduled=false;pcmInjectMobileChrome();pcmSyncMobileActive()});
});
pcmMobileObserver.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('resize',()=>{if(!pcmIsMobile())pcmCloseMobileMenu();else pcmInjectMobileChrome()});
window.addEventListener('DOMContentLoaded',pcmInjectMobileChrome);
document.addEventListener('click',e=>{if(PCM_MOBILE.moreOpen&&!e.target.closest('.pcm-mobile-more-sheet')&&!e.target.closest('[data-mobile-more]')){PCM_MOBILE.moreOpen=false;document.querySelector('.pcm-mobile-more-sheet')?.classList.remove('open')}});
setTimeout(pcmInjectMobileChrome,0);
