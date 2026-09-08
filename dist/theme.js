// Apply the theme before the stylesheet paints; remember only the appearance preference.
(()=>{
 const key='ntaxer-theme';
 const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
 let preference=null;
 try{const saved=localStorage.getItem(key);if(saved==='light'||saved==='dark')preference=saved;}catch{}
 function applyTheme(){
  const dark=preference?preference==='dark':systemTheme.matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0d1714':'#073e32');
  const button=document.getElementById('theme-toggle');
  if(button){
   const label=dark?'Switch to light mode':'Switch to dark mode';
   button.setAttribute('aria-label',label);
   button.setAttribute('aria-pressed',String(dark));
   button.title=label;
  }
 }
 applyTheme();
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('theme-toggle');
  applyTheme();
  button?.addEventListener('click',()=>{
   preference=document.documentElement.dataset.theme==='dark'?'light':'dark';
   try{localStorage.setItem(key,preference);}catch{}
   applyTheme();
  });
 },{once:true});
 systemTheme.addEventListener('change',()=>{if(!preference)applyTheme();});
})();
