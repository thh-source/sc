const PCM_LAYOUT_KEY='pcm-primary-menu-hidden';
const pcmDesktopLayout=()=>window.matchMedia('(min-width:801px)').matches;

function pcmMenuHidden(){try{return localStorage.getItem(PCM_LAYOUT_KEY)==='1'}catch{return false}}
function pcmSetMenuHidden(hidden){
  document.body.classList.toggle('pcm-primary-menu-hidden',!!hidden);
  try{localStorage.setItem(PCM_LAYOUT_KEY,hidden?'1':'0')}catch{}
  pcmSyncMenuToggle();
}
function pcmSyncMenuToggle(){
  const hidden=document.body.classList.contains('pcm-primary-menu-hidden');
  document.querySelectorAll('.pcm-desktop-menu-toggle').forEach(btn=>{
    btn.textContent=hidden?'☰':'◀';
    btn.title=hidden?'Hiện menubar':'Ẩn menubar';
    btn.setAttribute('aria-label',btn.title);
    btn.setAttribute('aria-expanded',hidden?'false':'true');
  });
}
function pcmInjectDesktopMenuToggle(){
  if(!pcmDesktopLayout())return;
  const topname=document.querySelector('.topbar .topname');
  if(!topname)return;
  topname.classList.add('pcm-topname-with-toggle');
  if(!topname.querySelector('.pcm-desktop-menu-toggle')){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='pcm-desktop-menu-toggle';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();pcmSetMenuHidden(!document.body.classList.contains('pcm-primary-menu-hidden'))});
    topname.prepend(btn);
  }
  document.body.classList.toggle('pcm-primary-menu-hidden',pcmMenuHidden());
  pcmSyncMenuToggle();
}

let pcmLayoutScheduled=false;
function pcmScheduleLayout(){
  if(pcmLayoutScheduled)return;
  pcmLayoutScheduled=true;
  requestAnimationFrame(()=>{pcmLayoutScheduled=false;pcmInjectDesktopMenuToggle()});
}
const pcmLayoutObserver=new MutationObserver(pcmScheduleLayout);
pcmLayoutObserver.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('resize',()=>{
  if(!pcmDesktopLayout())document.body.classList.remove('pcm-primary-menu-hidden');
  else pcmInjectDesktopMenuToggle();
});
window.addEventListener('DOMContentLoaded',pcmInjectDesktopMenuToggle);
setTimeout(pcmInjectDesktopMenuToggle,0);
