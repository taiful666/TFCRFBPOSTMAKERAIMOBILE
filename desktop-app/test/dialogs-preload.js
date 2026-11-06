// TEST ONLY: replaces blocking alert/confirm/prompt with logged, auto-answered versions so tests never hang.
const { webFrame } = require('electron');
webFrame.executeJavaScript(`(()=>{window.__dlg=[];const ans=()=>{try{const v=sessionStorage.getItem('__ans');return v==null?true:v==='1'}catch(e){return true}};
window.alert=m=>{window.__dlg.push(['alert',String(m)]);console.log('[DIALOG alert] '+String(m).slice(0,300)+' @@ '+String(new Error().stack).split('\\n').slice(2,7).join(' < ').replace(/tfapp:\\/\\/news\\/index.html:/g,'L'));};
window.confirm=m=>{const a=ans();window.__dlg.push(['confirm',String(m),a]);console.log('[DIALOG confirm] '+String(m).slice(0,300)+' -> '+a);return a;};
window.prompt=(m,d)=>{window.__dlg.push(['prompt',String(m)]);console.log('[DIALOG prompt] '+String(m).slice(0,200));return d||'';};})()`);
// a channel name is already set (as on the user's PC), so the first-run channel window does not cover the editor
try { if (location.hostname === 'news' && !localStorage.getItem('tfx_channels')) { localStorage.setItem('tfx_channels', JSON.stringify([{ id: 'c1', name: 'জিরো সিরিয়াস জোন' }])); localStorage.setItem('tfx_ch_active', JSON.stringify('c1')); } } catch (e) {}
