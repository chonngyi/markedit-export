/* MIT License. Copyright (c) 2026 chonngyi. */
(() => {
  'use strict';
  const api = require('markedit-api').MarkEdit;
  const root = api.getDirectoryPath('documents').replace(/\/$/, '');
  const support = `${root}/markedit-export`;
  const settingsPath = `${support}/options.json`;
  const defaults = {paper:'A4',font:'sans',size:11,margin:20};
  const EMBEDDED_FONTS = __MARKEDIT_EXPORT_FONTS__;
  let panel;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function loadFonts() { return EMBEDDED_FONTS; }
  async function buildHTML(options=defaults, markdown, title) {
    if (typeof window.MarkEditGetHtml !== 'function') throw Error('请启用 Markdown View Modes 预览扩展。');
    const info = await api.getFileInfo();
    title = title || info?.filePath.split('/').pop().replace(/\.[^.]+$/, '') || 'Untitled';
    const raw = markdown === undefined ? await window.MarkEditGetHtml(true) : await window.MarkEditRenderHtml(markdown,true);
    const doc = new DOMParser().parseFromString(raw,'text/html');
    const errors = doc.querySelectorAll('.katex-error');
    if (errors.length) throw Error(`有 ${errors.length} 处公式无法解析：${errors[0].textContent}`);
    const embedded = await loadFonts();
    for (const style of doc.querySelectorAll('style')) {
      style.textContent = style.textContent.replace(/@font-face\s*\{[^}]*\}/g, rule => {
        const name = rule.match(/KaTeX_[\w-]+\.woff2/)?.[0];
        if (!name) return rule;
        if (!embedded[name]) throw Error(`缺少公式字体：${name}`);
        return rule.replace(/src\s*:[^;]+;/,`src:url(data:font/woff2;base64,${embedded[name]}) format('woff2');`);
      });
    }
    for (const img of doc.querySelectorAll('img[src]')) {
      const src=img.getAttribute('src');
      if (/^data:/i.test(src)) continue;
      if (/^https?:/i.test(src)) throw Error('文档包含外部图片，请先将图片保存到本机并使用本地路径。');
      const path=decodeURIComponent(new URL(src,`file://${info?.parentPath || '/'}/`).pathname);
      const file=await api.getFileObject(path);
      if (!file?.data) throw Error(`无法读取图片：${path}`);
      img.setAttribute('src',`data:${file.mimeType || 'image/png'};base64,${file.data}`);
    }
    doc.querySelectorAll('script,base,link,iframe,object,embed').forEach(n=>n.remove());
    doc.querySelectorAll('*').forEach(n=>[...n.attributes].filter(a=>a.name.startsWith('on')).forEach(a=>n.removeAttribute(a.name)));
    for (const el of doc.querySelectorAll('*')) {
      for (const name of ['href','xlink:href']) {
        const value=el.getAttribute(name);
        if(value && /^(javascript|vbscript|data):/i.test(value.replace(/\s/g,''))) el.removeAttribute(name);
      }
    }
    const body=doc.querySelector('.markdown-body');
    if (!body) throw Error('预览没有返回可导出的正文。');
    const font=options.font==='serif'?'"Songti SC", "Times New Roman", serif':'"Heiti SC", Arial, sans-serif';
    const paper=options.paper==='Letter'?'Letter':'A4';
    const size=Math.min(16,Math.max(9,Number(options.size)||11));
    const margin=Math.min(35,Math.max(10,Number(options.margin)||20));
    const css=`:root{color-scheme:light!important}html,body{background:#edf0f4!important;color:#1c2533!important;margin:0}body{padding:32px 16px}.markdown-body{box-sizing:border-box;margin:0 auto!important;padding:${margin}mm!important;max-width:${paper==='A4'?'210mm':'216mm'}!important;background:white!important;color:#1c2533!important;font-family:${font}!important;font-size:${size}pt!important;line-height:1.65!important;border-radius:4px;box-shadow:0 4px 24px #15213d12}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4{color:#17243b!important;break-after:avoid}.markdown-body a{color:#2860b8!important}.markdown-body pre,.markdown-body blockquote,.markdown-body table{break-inside:avoid}.markdown-body img{max-width:100%}.katex-display{overflow-x:auto;padding:4px 0}.export-bar{font:14px -apple-system,sans-serif;max-width:210mm;margin:0 auto 20px;display:flex;align-items:center;gap:12px;color:#526078}.export-bar strong{flex:1}.export-bar button{border:0;border-radius:7px;background:#285dd9;color:white;padding:10px 18px;cursor:pointer}.export-bar span{font-size:12px}@page{size:${paper};margin:${margin}mm}@media print{html,body{background:white!important;padding:0!important}.export-bar{display:none!important}.markdown-body{padding:0!important;margin:0!important;max-width:none!important;box-shadow:none!important;border-radius:0}.katex-display{overflow:visible}.markdown-body pre{white-space:pre-wrap;overflow-wrap:anywhere}.markdown-body p{orphans:3;widows:3}}`;
    const script=`async function printPDF(){await document.fonts.ready;window.print()}document.getElementById('print-pdf').onclick=printPDF;if(location.hash==='#print')window.addEventListener('load',()=>setTimeout(printPDF,300));`;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(title)}</title>${[...doc.querySelectorAll('style')].map(s=>s.outerHTML).join('')}<style>${css}</style></head><body><nav class="export-bar"><strong>${esc(title)}</strong><span>打印目标选择 Save as PDF</span><button id="print-pdf">导出 PDF</button></nav>${body.outerHTML}<script>${script}</script></body></html>`;
  }
  async function compilePDF(options=defaults, content, sourcePath) {
    const info=await api.getFileInfo();
    if(!await api.getFileContent(`${support}/helper.json`)) throw Error('请先安装 MarkEdit Export Helper。');
    const jobs=`${support}/jobs`;
    await api.createFile({path:jobs,isDirectory:true});
    const id=`export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request=`${jobs}/${id}.markeditexport`;
    const response=request;
    const opts=Object.fromEntries(Object.entries({...defaults,...options}).map(([k,v])=>[k,String(v)]));
    const body={version:1,content:content===undefined?api.editorAPI.getText():content,sourcePath:sourcePath===undefined?info?.filePath:sourcePath,options:opts};
    if(!body.content.trim())throw Error('文档为空。');
    if(!await api.createFile({path:request,string:JSON.stringify(body)}))throw Error('无法创建编译请求。');
    if(!await api.openFile(request))throw Error('无法启动本机 PDF 编译助手。');
    const deadline=Date.now()+200000;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,250));
      const raw=await api.getFileContent(response);
      if(!raw)continue;
      let result;try{result=JSON.parse(raw)}catch{continue;}
      if(result.status!=='done')continue;
      if(!result.ok)throw Error(result.error||'PDF 编译失败。');
      await api.deleteFile(request);

      return result;
    }
    throw Error('编译超时，请重新导出。');
  }
  async function openBrowser(html) {
    const path=`${support}/preview-${Date.now()}.html`;
    if (!await api.createFile({path,string:html})) throw Error('无法创建导出预览。');
    if (!await api.openFile(path)) throw Error('无法打开浏览器，请检查默认 HTML 应用。');
  }
  async function show() {
    if(panel){panel.remove();panel=null;}
    await api.createFile({path:support,isDirectory:true});
    let options={...defaults};
    try{options={...options,...JSON.parse(await api.getFileContent(settingsPath)||'{}')}}catch{}
    const host=document.createElement('div');
    host.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.22);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  .shell {
    --surface:#f7f7f7; --sidebar:#f0f0f0; --control:#fff;
    --text:#1d1d1f; --secondary:#6e6e73; --line:rgba(0,0,0,.12);
    --accent:#007aff; --button-line:rgba(0,0,0,.18); --hover:rgba(0,0,0,.045);
    font:13px/1.4 -apple-system,BlinkMacSystemFont,"Heiti SC",sans-serif;
    color:var(--text); background:var(--surface);
    width:min(1020px,94vw); height:min(740px,90vh);
    display:flex; flex-direction:column; overflow:hidden;
    border:1px solid rgba(255,255,255,.5); border-radius:13px;
    box-shadow:0 20px 65px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.12);
  }
  header { display:flex; align-items:center; gap:12px; padding:17px 20px 16px; border-bottom:1px solid var(--line); }
  h2 { margin:0; font-size:17px; font-weight:600; letter-spacing:-.3px; }
  button,select { font:inherit; }
  button { cursor:default; color:var(--text); }
  button:focus-visible,select:focus-visible { outline:3px solid color-mix(in srgb,var(--accent) 45%,transparent); outline-offset:2px; }
  .close { margin-left:auto; flex-shrink:0; border:0; background:transparent; border-radius:6px; width:25px; height:25px; padding:0; color:var(--secondary); font-size:22px; line-height:23px; }
  .close:hover { background:var(--hover); }
  .main { display:grid; grid-template-columns:216px 1fr; min-height:0; flex:1; }
  aside { padding:22px 18px; background:var(--sidebar); border-right:1px solid var(--line); }
  label { display:block; font-size:12px; margin-bottom:17px; }
  select { display:block; width:100%; margin-top:6px; padding:4px 7px; min-height:28px; border:1px solid var(--button-line); border-radius:6px; background:var(--control); color:var(--text); box-shadow:0 1px 1px #00000006; }
  .preview { min-width:0; min-height:0; display:flex; flex-direction:column; background:#e6e6e8; }
  iframe { width:100%; flex:1; min-height:0; border:0; }
  footer { display:flex; justify-content:flex-end; align-items:center; gap:8px; padding:13px 18px; min-height:56px; border-top:1px solid var(--line); }
  .status { display:none; margin-right:auto; color:var(--secondary); font-size:13px; max-width:43%; max-height:48px; overflow:auto; line-height:1.45; white-space:pre-line; }
  .status[data-state="error"] { display:block; color:#d92d20; }
  footer button { white-space:nowrap; background:var(--control); border:1px solid var(--button-line); border-radius:6px; min-height:28px; padding:4px 12px; box-shadow:0 1px 1px #00000008; }
  footer button:hover { filter:brightness(.98); }
  footer button:active { background:var(--hover); }
  footer .primary { color:#fff; background:var(--accent); border-color:transparent; font-weight:500; min-width:106px; }
  footer .primary:active { filter:brightness(.9); }
  button:disabled { opacity:.45; }
  @media(prefers-color-scheme:dark) {
    .shell { --surface:#2c2c2e; --sidebar:#252527; --control:#48484a; --text:#f5f5f7; --secondary:#a1a1a6; --line:rgba(255,255,255,.1); --accent:#0a84ff; --button-line:rgba(255,255,255,.12); --hover:rgba(255,255,255,.07); border-color:rgba(255,255,255,.14); box-shadow:0 20px 65px #0008,0 0 0 1px #0008; }
    .status[data-state="error"] { display:block; color:#ff6961; }
    .preview { background:#202022; }
  }
  @media(max-width:700px) {
    .main { grid-template-columns:175px 1fr; }
    aside { padding:18px 13px; }
    footer { flex-wrap:wrap; justify-content:flex-end; }
    .status { flex-basis:100%; max-width:100%; }
  }
</style>
<section class="shell" role="dialog" aria-modal="true" aria-label="导出文档">
  <header>
    <h2>导出文档</h2>
    <button class="close" aria-label="关闭" title="关闭（Esc）">×</button>
  </header>
  <div class="main">
    <aside>
      <label>纸张大小<select name="paper"><option>A4</option><option>Letter</option></select></label>
      <label>正文字体<select name="font"><option value="sans">Heiti SC</option><option value="serif">Songti SC</option></select></label>
      <label>字号<select name="size">${[10,11,12,14].map(n=>`<option value="${n}">${n} 磅</option>`).join('')}</select></label>
      <label>页边距<select name="margin">${[15,20,25,30].map(n=>`<option value="${n}">${n} 毫米</option>`).join('')}</select></label>
    </aside>
    <div class="preview">
      <iframe title="导出内容预览" sandbox="allow-same-origin"></iframe>
    </div>
  </div>
  <footer>
    <span class="status" role="alert" aria-live="polite"></span>
    <button data-action="browser">预览网页</button>
    <button data-action="html">导出 HTML…</button>
    <button class="primary" data-action="pdf">导出 PDF…</button>
  </footer>
</section>`;
    document.body.append(host);panel=host;
    const $=s=>shadow.querySelector(s);
    const close=()=>{host.remove();if(panel===host)panel=null;api.editorView.focus()};
    $('.close').onclick=close;
    host.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')close()};
    const fields=[...shadow.querySelectorAll('select')];
    for(const f of fields) f.value=String(options[f.name]);
    let html='',revision=0,pending=Promise.resolve();
    const render=async()=>{
      const version=++revision;
      options=Object.fromEntries(fields.map(f=>[f.name,f.value]));
      try{
        $('.status').textContent='正在准备预览…';delete $('.status').dataset.state;
        const rendered=await buildHTML(options);
        if(version!==revision)return;
        html=rendered;$('iframe').srcdoc=html.replace('</head>','<style>.export-bar{display:none!important}body{background:#e6e6e8!important}@media(prefers-color-scheme:dark){body{background:#202022!important}}</style></head>');
        $('.status').textContent='已就绪';
      }catch(e){html='';$('.status').textContent=e.message;$('.status').dataset.state='error';}
    };
    for(const f of fields) f.onchange=()=>{pending=render()};
    for(const b of shadow.querySelectorAll('[data-action]')) b.onclick=async()=>{
      const originalLabel=b.textContent;
      const buttons=[...shadow.querySelectorAll('[data-action]')];buttons.forEach(x=>x.disabled=true);
      b.textContent='正在导出…';
      try{
        delete $('.status').dataset.state;
        await pending;if(b.dataset.action!=='pdf'&&!html)throw Error('请先修复预览中显示的问题。');
        await api.createFile({path:settingsPath,string:JSON.stringify(options),overwrites:true});
        const info=await api.getFileInfo();
        const name=(info?.filePath.split('/').pop().replace(/\.[^.]+$/,'')||'Untitled')+'.html';
        if(b.dataset.action==='pdf'){
          $('.status').textContent='正在排版 PDF，请稍候…';
          const result=await compilePDF(options);
          const pdfName=name.replace(/\.html$/,'.pdf');
          const saved=await api.showSavePanel({fileName:pdfName,data:result.data});
          $('.status').textContent=saved?'PDF 已保存':'已取消保存';
        }else if(b.dataset.action==='html'){
          const saved=await api.showSavePanel({fileName:name,string:html});
          $('.status').textContent=saved?'HTML 已保存':'已取消保存';
        }else{
          let output=html;
          if(b.dataset.action==='pdf')output=output.replace("if(location.hash==='#print')",'if(true)');
          await openBrowser(output);
          $('.status').textContent=b.dataset.action==='pdf'?'已打开打印页面，请选择 Save as PDF':'已在浏览器打开';
        }
      }catch(e){$('.status').textContent=e.message;$('.status').dataset.state='error';}
      finally{buttons.forEach(x=>x.disabled=false);b.textContent=originalLabel}
    };
    pending=render();$('.close').focus();
  }
  window.MarkEditExport={show,buildHTML,compilePDF};
  api.addMainMenuItem({title:'导出文档…',icon:'square.and.arrow.up',key:'E',modifiers:['Command','Shift'],action:()=>window.MarkEditExport.show()});
})();
