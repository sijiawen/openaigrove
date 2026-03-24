'use client';
import { useEffect } from 'react';

export default function FrameReady() {
  useEffect(() => {
    let lib = { actor: [], wardrobe: [], prop: [], set: [] };
    let nodes = [];
    let edges = [];
    let nodeId = 0, edgeId = 0, assetId = 0;
    let cat = 'actor';
    let camX = 0, camY = 0, camZ = 1;
    let isPanning = false, panStart = null;
    let isLassoing = false, lassoRect = null;
    let selectedNodeIds = new Set();
    let draggingNode = null;
    let sidebarDragAssetId = null;
    let spaceDown = false;

    const CATS = { actor:'Actors', wardrobe:'Wardrobe', prop:'Props', set:'Sets' };
    const COLS = { actor:'var(--cat-actor)', wardrobe:'var(--cat-wardrobe)', prop:'var(--cat-prop)', set:'var(--cat-set)' };

    function h(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
    function findA(id){for(const l of Object.values(lib)){const a=l.find(x=>x.id===id);if(a)return a;}return null;}
    function getWrap(){return document.getElementById('canvasWrap');}
    function screenToCanvas(sx,sy){return{x:(sx-camX)/camZ,y:(sy-camY)/camZ};}

    function toast(msg,type){
      const t=document.getElementById('toast');
      document.getElementById('tDot').style.background=type==='ok'?'var(--success)':type==='err'?'var(--error)':'var(--text-tertiary)';
      document.getElementById('tMsg').textContent=msg;
      t.className='toast show'; clearTimeout(t._t);
      t._t=setTimeout(()=>t.className='toast',2800);
    }

    // ── LIBRARY ──────────────────────────────────────────────────────────────
    window._switchCat=c=>{
      cat=c;
      document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('on',b.dataset.c===c));
      document.getElementById('catLabel').textContent=CATS[c];
      renderLib();
    };

    function renderLib(){
      const list=lib[cat];
      document.getElementById('catCount').textContent=list.length;
      const g=document.getElementById('assetGrid');
      if(!list.length){g.innerHTML=`<div class="no-assets">No ${CATS[cat].toLowerCase()} yet.</div>`;return;}
      g.innerHTML=list.map(a=>`
        <div class="asset-card" draggable="true" ondragstart="window._sbDragStart(event,'${a.id}')" title="${h(a.name)}">
          <div class="asset-cat-dot" style="background:${COLS[a.cat]}"></div>
          <img src="${h(a.src)}" loading="lazy"/>
          <div class="asset-name">${h(a.name)}</div>
          <button class="asset-del" onclick="event.stopPropagation();window._delAsset('${a.id}','${a.cat}')">✕</button>
        </div>`).join('');
    }

    window._doUpload=()=>document.getElementById('fileIn').click();
    window._doUrl=()=>{
      const url=prompt('Paste an image URL:'); if(!url) return;
      const name=document.getElementById('nameField').value.trim()||'Asset';
      addAsset(cat,name,url); document.getElementById('nameField').value='';
    };

    function addAsset(c,name,src){
      const id='a'+(++assetId);
      lib[c].push({id,name,src,cat:c});
      if(c===cat) renderLib();
      toast(`Added "${name}"`,'ok');
    }

    window._delAsset=(id,c)=>{lib[c]=lib[c].filter(a=>a.id!==id);if(c===cat)renderLib();};
    window._sbDragStart=(e,id)=>{sidebarDragAssetId=id;e.dataTransfer.effectAllowed='copy';};

    document.getElementById('fileIn').addEventListener('change',e=>{
      const f=e.target.files[0]; if(!f) return;
      const uploadCat=cat;
      const name=document.getElementById('nameField').value.trim()||f.name.replace(/\.[^.]+$/,'');
      const r=new FileReader();
      r.onload=ev=>addAsset(uploadCat,name,ev.target.result);
      r.readAsDataURL(f);
      e.target.value=''; document.getElementById('nameField').value='';
    });

    // ── RENDER ────────────────────────────────────────────────────────────────
    function renderCanvas(){
      const wrap=getWrap(); if(!wrap) return;
      // Save any prompt text and focus state before re-rendering
      let focusedPromptId=null, selStart=0, selEnd=0;
      nodes.forEach(n=>{
        if(n.type==='generate'){
          const ta=document.getElementById('gp-'+n.id);
          if(ta){
            n.prompt=ta.value;
            if(document.activeElement===ta){
              focusedPromptId='gp-'+n.id;
              selStart=ta.selectionStart;
              selEnd=ta.selectionEnd;
            }
          }
        }
      });
      document.getElementById('canvasWorld').style.transform=`translate(${camX}px,${camY}px) scale(${camZ})`;
      renderEdges();
      const nodesEl=document.getElementById('canvasNodes');
      nodesEl.innerHTML=nodes.map(n=>renderNode(n)).join('');
      nodes.forEach(n=>bindNode(n));
      renderLasso();
      // Restore focus if a textarea was focused
      if(focusedPromptId){
        const ta=document.getElementById(focusedPromptId);
        if(ta){ta.focus();ta.setSelectionRange(selStart,selEnd);}
      }
    }

    function renderNode(n){
      const sel=selectedNodeIds.has(n.id)?'selected':'';
      if(n.type==='asset'){
        const asset=findA(n.assetId); if(!asset) return '';
        const w=n.w||120, hh=n.h||120;
        return `<div class="canvas-node asset-node ${sel}" id="node-${n.id}" style="left:${n.x}px;top:${n.y}px;width:${w}px" data-nid="${n.id}">
          <div class="node-drag-handle">
            <div class="node-img-wrap" style="height:${hh}px">
              <img src="${h(asset.src)}" draggable="false"/>
              <div class="node-cat-dot" style="background:${COLS[asset.cat]}"></div>
            </div>
            <div class="node-label">${h(asset.name)}</div>
          </div>
          <button class="node-del">✕</button>
          <div class="node-rz" data-nid="${n.id}"></div>
        </div>`;
      }
      if(n.type==='generate'){
        const connectedInputs=edges.filter(e=>e.toNodeId===n.id).map(e=>nodes.find(nd=>nd.id===e.fromNodeId)).filter(Boolean);
        const inputAssets=connectedInputs.filter(nd=>nd.type==='asset').map(nd=>findA(nd.assetId)).filter(Boolean);
        const chainedGens=connectedInputs.filter(nd=>nd.type==='generate');
        const hasWardrobe=inputAssets.some(a=>a.cat==='wardrobe');
        const setAsset=inputAssets.find(a=>a.cat==='set');
        const propAssets=inputAssets.filter(a=>a.cat!=='set'&&a.cat!=='wardrobe'&&a.cat!=='actor');
        const showSpatial=!hasWardrobe&&setAsset&&propAssets.length>0&&!n.gen;

        const tags=[
          ...inputAssets.map(a=>`<div class="input-tag" style="border-color:${COLS[a.cat]}">${h(a.name)}</div>`),
          ...chainedGens.map(g=>`<div class="input-tag chain-tag">⬡ ${g.gen?'Frame':'Pending'}</div>`)
        ].join('');

        const spatialHtml=showSpatial?`
          <div class="spatial-hint">Drag props to position, then Generate</div>
          <div class="spatial-canvas" id="sc-${n.id}" style="background-image:url('${setAsset.src}')">
            ${(n.placements||[]).map(pl=>{
              const a=findA(pl.assetId);
              return a?`<div class="sp-item" id="sp-${pl.id}" data-plid="${pl.id}" data-nid="${n.id}" style="left:${pl.px}%;top:${pl.py}%;width:${pl.pw||15}%"><img src="${h(a.src)}" draggable="false"/><div class="sp-rz" data-plid="${pl.id}" data-nid="${n.id}"></div></div>`:'';
            }).join('')}
          </div>`:'';

        const totalInputs=connectedInputs.length;
        const hasChainReady=chainedGens.some(g=>g.gen);
        const placeholder=totalInputs
          ?`${totalInputs} input${totalInputs>1?'s':''} connected${hasChainReady?' · ready to chain':''}`
          :'Connect assets or right-click a generated image';

        const genContent=n.gen
          ?`<img class="gen-result" src="${h(n.gen)}" data-nid="${n.id}"/>`
          :`<div class="gen-placeholder"><div class="gen-icon">✦</div><p>${placeholder}</p></div>`;

        return `<div class="canvas-node generate-node ${sel} ${n.generating?'generating':''}" id="node-${n.id}" style="left:${n.x}px;top:${n.y}px" data-nid="${n.id}">
          <div class="gen-header node-drag-handle">
            <span class="gen-title">✦ Generate</span>
            <button class="node-del">✕</button>
          </div>
          ${tags?`<div class="input-tags">${tags}</div>`:''}
          ${spatialHtml}
          <div class="gen-content">${genContent}</div>
          <div class="gen-controls">
            <textarea class="gen-prompt" id="gp-${n.id}" placeholder="${hasWardrobe?'e.g. Put jacket on her, keep pose':'Describe this shot…'}">${h(n.prompt||'')}</textarea>
            <div class="gen-actions">
              <button class="gen-btn ${n.generating?'loading':''}" ${n.generating?'disabled':''}>
                ${n.generating?'<div class="spin"></div>':'Generate'}
              </button>
              ${n.gen?`<button class="dl-btn">⬇</button>`:''}
            </div>
          </div>
        </div>`;
      }
      return '';
    }

    function renderEdges(){
      const svg=document.getElementById('edgesSvg'); if(!svg) return;
      svg.innerHTML=edges.map(e=>{
        const from=nodes.find(n=>n.id===e.fromNodeId), to=nodes.find(n=>n.id===e.toNodeId);
        if(!from||!to) return '';
        const fw=from.type==='generate'?320:(from.w||120);
        const fh=from.type==='generate'?160:(from.h||120);
        const x1=from.x+fw, y1=from.y+fh/2;
        const x2=to.x, y2=to.y+50;
        const dx=Math.abs(x2-x1)*0.5;
        return `<path d="M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" fill="none" stroke-dasharray="4,4"/>`;
      }).join('');
    }

    function renderLasso(){
      const el=document.getElementById('lassoRect'); if(!el) return;
      if(isLassoing&&lassoRect){
        el.style.cssText=`display:block;left:${Math.min(lassoRect.x1,lassoRect.x2)*camZ+camX}px;top:${Math.min(lassoRect.y1,lassoRect.y2)*camZ+camY}px;width:${Math.abs(lassoRect.x2-lassoRect.x1)*camZ}px;height:${Math.abs(lassoRect.y2-lassoRect.y1)*camZ}px;`;
      } else { el.style.display='none'; }
    }

    function updateSelection(){
      document.querySelectorAll('.canvas-node').forEach(el=>{
        el.classList.toggle('selected',selectedNodeIds.has(el.dataset.nid));
      });
    }

    // ── BIND NODE EVENTS ─────────────────────────────────────────────────────
    function bindNode(n){
      const el=document.getElementById('node-'+n.id); if(!el) return;

      // Resize handle (asset nodes only)
      const rz=el.querySelector('.node-rz');
      if(rz){
        rz.onmousedown=e=>{
          e.stopPropagation(); e.preventDefault();
          const sx=e.clientX, sy=e.clientY, sw=n.w||120, sh=n.h||120;
          const mv=ev=>{
            n.w=Math.max(60,sw+(ev.clientX-sx)/camZ);
            n.h=Math.max(60,sh+(ev.clientY-sy)/camZ);
            const el2=document.getElementById('node-'+n.id); if(!el2) return;
            el2.style.width=n.w+'px';
            const iw=el2.querySelector('.node-img-wrap');
            if(iw) iw.style.height=n.h+'px';
            renderEdges();
          };
          const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);renderCanvas();};
          document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
        };
      }

      // Right-click on generated image → select this node and show context menu
      const genImg=el.querySelector('.gen-result');
      if(genImg){
        genImg.addEventListener('contextmenu',e=>{
          e.preventDefault(); e.stopPropagation();
          selectedNodeIds.clear();
          selectedNodeIds.add(n.id);
          updateSelection();
          showCtxMenu(e.clientX,e.clientY);
        });
      }

      // Spatial canvas
      const sc=el.querySelector('.spatial-canvas');
      if(sc){
        sc.querySelectorAll('.sp-item').forEach(item=>{
          item.addEventListener('mousedown',e=>{
            if(e.target.closest('.sp-rz')) return;
            e.stopPropagation(); e.preventDefault();
            const plid=item.dataset.plid, nid=item.dataset.nid;
            const nd=nodes.find(x=>x.id===nid);
            const pl=nd?.placements?.find(p=>p.id===plid); if(!pl) return;
            const rect=sc.getBoundingClientRect();
            const mv=ev=>{
              pl.px=Math.max(0,Math.min(90,(ev.clientX-rect.left)/rect.width*100));
              pl.py=Math.max(0,Math.min(90,(ev.clientY-rect.top)/rect.height*100));
              item.style.left=pl.px+'%'; item.style.top=pl.py+'%';
            };
            const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
            document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
          });
          const sprz=item.querySelector('.sp-rz');
          if(sprz){
            sprz.addEventListener('mousedown',e=>{
              e.stopPropagation(); e.preventDefault();
              const plid=item.dataset.plid, nid=item.dataset.nid;
              const nd=nodes.find(x=>x.id===nid);
              const pl=nd?.placements?.find(p=>p.id===plid); if(!pl) return;
              const sx=e.clientX, sw=pl.pw||15;
              const mv=ev=>{
                const rect=sc.getBoundingClientRect();
                pl.pw=Math.max(5,Math.min(60,sw+(ev.clientX-sx)/rect.width*100));
                item.style.width=pl.pw+'%';
              };
              const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
              document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
            });
          }
        });
        sc.addEventListener('dragover',e=>e.preventDefault());
        sc.addEventListener('drop',e=>{
          e.stopPropagation(); e.preventDefault();
          if(!sidebarDragAssetId) return;
          const rect=sc.getBoundingClientRect();
          if(!n.placements) n.placements=[];
          n.placements.push({id:'pl'+(++nodeId),assetId:sidebarDragAssetId,px:(e.clientX-rect.left)/rect.width*100,py:(e.clientY-rect.top)/rect.height*100,pw:15});
          sidebarDragAssetId=null; renderCanvas();
        });
      }

      // Delete button
      const delBtn=el.querySelector('.node-del');
      if(delBtn) delBtn.onclick=()=>window._delNode(n.id);

      // Generate button (for generate nodes)
      const genBtn=el.querySelector('.gen-btn');
      if(genBtn) genBtn.onclick=()=>window._generate(n.id);

      // Download button (for generate nodes)
      const dlBtn=el.querySelector('.dl-btn');
      if(dlBtn) dlBtn.onclick=()=>window._dlNode(n.id);

      // Node drag — only from drag handle
      const handle=el.querySelector('.node-drag-handle')||el;
      handle.addEventListener('mousedown',e=>{
        if(e.target.closest('button')||e.target.closest('textarea')||e.target.closest('.gen-result')||e.target.closest('.node-rz')||e.target.closest('.spatial-canvas')) return;
        e.stopPropagation();
        if(!e.shiftKey&&!selectedNodeIds.has(n.id)){selectedNodeIds.clear();selectedNodeIds.add(n.id);updateSelection();}
        else if(e.shiftKey){
          if(selectedNodeIds.has(n.id)) selectedNodeIds.delete(n.id); else selectedNodeIds.add(n.id);
          updateSelection();
        }
        const wrapRect=getWrap().getBoundingClientRect();
        const cp=screenToCanvas(e.clientX-wrapRect.left,e.clientY-wrapRect.top);
        if(selectedNodeIds.size>1){
          const offsets={};
          selectedNodeIds.forEach(id=>{const nd=nodes.find(x=>x.id===id);if(nd)offsets[id]={dx:cp.x-nd.x,dy:cp.y-nd.y};});
          draggingNode={isGroup:true,offsets};
        } else {
          draggingNode={isGroup:false,nodeId:n.id,ox:cp.x-n.x,oy:cp.y-n.y};
        }
      });
    }

    // ── CANVAS EVENTS ─────────────────────────────────────────────────────────
    function setupCanvas(){
      const wrap=getWrap(); if(!wrap) return;

      const onKeyDown=e=>{
        if(e.code==='Space'&&!e.target.closest('textarea')&&!e.target.closest('input')){
          spaceDown=true; wrap.style.cursor='grab'; e.preventDefault();
        }
      };
      const onKeyUp=e=>{if(e.code==='Space'){spaceDown=false;if(!isPanning)wrap.style.cursor='default';}};
      document.addEventListener('keydown',onKeyDown);
      document.addEventListener('keyup',onKeyUp);

      wrap.addEventListener('dragover',e=>e.preventDefault());
      wrap.addEventListener('drop',e=>{
        if(e.target.closest('.spatial-canvas')) return;
        e.preventDefault();
        if(!sidebarDragAssetId) return;
        const r=wrap.getBoundingClientRect();
        const cp=screenToCanvas(e.clientX-r.left,e.clientY-r.top);
        const id='n'+(++nodeId);
        const asset=findA(sidebarDragAssetId);
        const isSet=asset?.cat==='set';
        nodes.push({id,type:'asset',x:cp.x-60,y:cp.y-60,assetId:sidebarDragAssetId,w:isSet?200:120,h:isSet?134:120});
        sidebarDragAssetId=null; renderCanvas();
      });

      let rightClickStart=null;
      wrap.addEventListener('mousedown',e=>{
        const onNode=!!e.target.closest('.canvas-node');
        const r=wrap.getBoundingClientRect();
        rightClickStart=e.button===2?{x:e.clientX,y:e.clientY}:null;
        if(e.button===1||(e.button===0&&(e.altKey||spaceDown))||(e.button===2&&!onNode)){
          e.preventDefault(); isPanning=true; panStart={x:e.clientX-camX,y:e.clientY-camY}; wrap.style.cursor='grabbing'; return;
        }
        if(onNode&&!spaceDown) return;
        if(e.button===0){
          const cp=screenToCanvas(e.clientX-r.left,e.clientY-r.top);
          isLassoing=true; lassoRect={x1:cp.x,y1:cp.y,x2:cp.x,y2:cp.y};
          selectedNodeIds.clear(); renderCanvas();
        }
      });

      wrap.addEventListener('mousemove',e=>{
        const r=wrap.getBoundingClientRect();
        if(isPanning){camX=e.clientX-panStart.x;camY=e.clientY-panStart.y;renderCanvas();}
        else if(isLassoing){
          const cp=screenToCanvas(e.clientX-r.left,e.clientY-r.top);
          lassoRect.x2=cp.x; lassoRect.y2=cp.y;
          selectedNodeIds.clear();
          const lx1=Math.min(lassoRect.x1,lassoRect.x2),lx2=Math.max(lassoRect.x1,lassoRect.x2);
          const ly1=Math.min(lassoRect.y1,lassoRect.y2),ly2=Math.max(lassoRect.y1,lassoRect.y2);
          nodes.forEach(n=>{
            const nw=n.type==='generate'?320:(n.w||120), nh=n.type==='generate'?160:(n.h||120);
            const cx=n.x+nw/2, cy=n.y+nh/2;
            if(cx>=lx1&&cx<=lx2&&cy>=ly1&&cy<=ly2) selectedNodeIds.add(n.id);
          });
          renderCanvas();
        } else if(draggingNode){
          const cp=screenToCanvas(e.clientX-r.left,e.clientY-r.top);
          if(draggingNode.isGroup){
            selectedNodeIds.forEach(id=>{const nd=nodes.find(x=>x.id===id);if(nd&&draggingNode.offsets[id]){nd.x=cp.x-draggingNode.offsets[id].dx;nd.y=cp.y-draggingNode.offsets[id].dy;}});
          } else {
            const nd=nodes.find(x=>x.id===draggingNode.nodeId);
            if(nd){nd.x=cp.x-draggingNode.ox;nd.y=cp.y-draggingNode.oy;}
          }
          renderCanvas();
        }
      });

      wrap.addEventListener('mouseup',()=>{
        const needsRender=isPanning||isLassoing||draggingNode;
        isPanning=false;isLassoing=false;lassoRect=null;draggingNode=null;wrap.style.cursor=spaceDown?'grab':'default';
        if(needsRender) renderCanvas();
      });
      wrap.addEventListener('mouseleave',()=>{isPanning=false;isLassoing=false;lassoRect=null;draggingNode=null;renderCanvas();});

      wrap.addEventListener('wheel',e=>{
        e.preventDefault();
        if(e.ctrlKey||e.metaKey){
          const r=wrap.getBoundingClientRect();
          const mx=e.clientX-r.left, my=e.clientY-r.top;
          const newZ=Math.min(3,Math.max(0.15,camZ*(e.deltaY<0?1.1:0.9)));
          camX=mx-(mx-camX)*(newZ/camZ); camY=my-(my-camY)*(newZ/camZ); camZ=newZ;
        } else {
          camX-=e.deltaX; camY-=e.deltaY;
        }
        renderCanvas();
      },{passive:false});

      wrap.addEventListener('contextmenu',e=>{
        e.preventDefault();
        const dragged=rightClickStart&&(Math.abs(e.clientX-rightClickStart.x)>4||Math.abs(e.clientY-rightClickStart.y)>4);
        if(dragged) return;
        // If right-clicking on a node (not on gen-result which has its own handler), select it
        const nodeEl=e.target.closest('.canvas-node');
        if(nodeEl&&!e.target.closest('.gen-result')){
          const nid=nodeEl.dataset.nid;
          if(nid&&!selectedNodeIds.has(nid)){
            selectedNodeIds.add(nid);
            updateSelection();
          }
        }
        showCtxMenu(e.clientX,e.clientY);
      });

      document.addEventListener('click',()=>hideCtxMenu());

      // Cleanup
      return ()=>{
        document.removeEventListener('keydown',onKeyDown);
        document.removeEventListener('keyup',onKeyUp);
      };
    }

    // ── CONTEXT MENU ─────────────────────────────────────────────────────────
    function showCtxMenu(x,y){
      const m=document.getElementById('ctxMenu');
      m.style.cssText=`display:block;left:${x}px;top:${y}px;`;
      m.dataset.cx=x; m.dataset.cy=y;
    }
    function hideCtxMenu(){const m=document.getElementById('ctxMenu');if(m)m.style.display='none';}

    window._ctxAddGenerate=()=>{
      const m=document.getElementById('ctxMenu');
      const wrapRect=getWrap().getBoundingClientRect();
      const cp=screenToCanvas(parseFloat(m.dataset.cx)-wrapRect.left,parseFloat(m.dataset.cy)-wrapRect.top);
      hideCtxMenu();
      const newId='n'+(++nodeId);
      const placements=[];
      const toConnect=[...selectedNodeIds]; // snapshot before clear
      // Build placements for prop/actor assets
      toConnect.forEach(selId=>{
        const sn=nodes.find(n=>n.id===selId); if(!sn||sn.type!=='asset') return;
        const a=findA(sn.assetId);
        if(a&&(a.cat==='prop'||a.cat==='actor')){
          placements.push({id:'pl'+(++nodeId),assetId:sn.assetId,px:30+(placements.length*20),py:40,pw:15});
        }
      });
      nodes.push({id:newId,type:'generate',x:cp.x,y:cp.y,prompt:'',gen:null,generating:false,placements});
      // Connect all selected nodes to the new generate node
      toConnect.forEach(selId=>{
        if(selId!==newId) edges.push({id:'e'+(++edgeId),fromNodeId:selId,toNodeId:newId});
      });
      selectedNodeIds.clear();
      renderCanvas();
      toast('Generate node created','ok');
    };

    window._ctxFitView=()=>{
      hideCtxMenu();
      if(!nodes.length) return;
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      nodes.forEach(n=>{minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x+340);maxY=Math.max(maxY,n.y+250);});
      const wrap=getWrap(), pw=wrap.offsetWidth, ph=wrap.offsetHeight;
      const ww=maxX-minX+100, wh=maxY-minY+100;
      camZ=Math.min(3,Math.max(0.15,Math.min(pw/ww,ph/wh)*0.85));
      camX=(pw-ww*camZ)/2-minX*camZ+50*camZ; camY=(ph-wh*camZ)/2-minY*camZ+50*camZ;
      renderCanvas();
    };

    window._delNode=id=>{
      nodes=nodes.filter(n=>n.id!==id);
      edges=edges.filter(e=>e.fromNodeId!==id&&e.toNodeId!==id);
      selectedNodeIds.delete(id); renderCanvas();
    };

    // ── BG REMOVAL + COMPOSITE ────────────────────────────────────────────────
    async function removeBackground(dataUrl){
      try{const res=await fetch('/api/removebg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64:dataUrl})});return(await res.json()).result||dataUrl;}
      catch(e){return dataUrl;}
    }

    async function buildComposite(node,bgAsset,others){
      const W=1536,H=1024;
      const c=document.createElement('canvas'); c.width=W; c.height=H;
      const ctx=c.getContext('2d');
      function li(src){return new Promise((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>res(img);img.onerror=rej;img.src=src;});}
      if(bgAsset?.src){try{const bg=await li(bgAsset.src);ctx.drawImage(bg,0,0,W,H);}catch(e){ctx.fillStyle='#333';ctx.fillRect(0,0,W,H);}}
      else{ctx.fillStyle='#333';ctx.fillRect(0,0,W,H);}
      const placements=node?.placements||[];
      for(const asset of others){
        if(!asset?.src) continue;
        try{
          const img=await li(asset.src);
          const pl=placements.find(p=>p.assetId===asset.id);
          if(pl){ctx.drawImage(img,(pl.px/100)*W,(pl.py/100)*H,(pl.pw/100)*W,(pl.pw/100)*W*(img.naturalHeight/img.naturalWidth));}
          else{const w=W*0.25;ctx.drawImage(img,W/2-w/2,H*0.2,w,H*0.55);}
        }catch(e){}
      }
      return c.toDataURL('image/png');
    }

    // ── GENERATE ──────────────────────────────────────────────────────────────
    window._generate=async nid=>{
      const node=nodes.find(n=>n.id===nid); if(!node) return;
      const promptEl=document.getElementById('gp-'+nid);
      const userPrompt=promptEl?.value.trim()||'';
      node.prompt=userPrompt;
      const connectedInputs=edges.filter(e=>e.toNodeId===nid).map(e=>nodes.find(n=>n.id===e.fromNodeId)).filter(Boolean);
      const inputAssets=connectedInputs.filter(nd=>nd.type==='asset').map(nd=>findA(nd.assetId)).filter(Boolean);
      const chainedGens=connectedInputs.filter(nd=>nd.type==='generate'&&nd.gen);
      if(!inputAssets.length&&!chainedGens.length&&!node.gen){toast('Connect assets or chain a generated frame','err');return;}
      node.generating=true; renderCanvas();
      try{
        const wardrobeAssets=inputAssets.filter(a=>a.cat==='wardrobe');
        const actorAssets=inputAssets.filter(a=>a.cat==='actor');
        const setAssets=inputAssets.filter(a=>a.cat==='set');
        const propAssets=inputAssets.filter(a=>a.cat==='prop');
        const hasWardrobe=wardrobeAssets.length>0;
        let payload;

        // Check if we're compositing multiple generated frames (scene + actor)
        if(chainedGens.length>=2){
          // Find which gen is the scene (no wardrobe in its inputs) and which has the actor
          let sceneGen=null, actorGen=null;
          for(const cg of chainedGens){
            const cgInputs=edges.filter(e=>e.toNodeId===cg.id).map(e=>nodes.find(n=>n.id===e.fromNodeId)).filter(Boolean);
            const cgAssets=cgInputs.filter(nd=>nd.type==='asset').map(nd=>findA(nd.assetId)).filter(Boolean);
            const hasWardrobeInput=cgAssets.some(a=>a.cat==='wardrobe');
            const hasActorInput=cgAssets.some(a=>a.cat==='actor');
            if(hasWardrobeInput||hasActorInput) actorGen=cg;
            else sceneGen=cg;
          }
          if(sceneGen&&actorGen){
            payload={mode:'composite_actor',sceneImage:sceneGen.gen,actorGenImage:actorGen.gen,userPrompt};
          } else {
            // Fallback: use the last one as base
            payload={mode:'props',previousGen:chainedGens[chainedGens.length-1].gen,userPrompt:userPrompt||'Refine this frame'};
          }
        } else if(hasWardrobe){
          const rawSrc=actorAssets[0]?.src||null;
          if(!rawSrc){toast('Add an actor asset','err');node.generating=false;renderCanvas();return;}
          payload={mode:'wardrobe',actorImage:rawSrc,wardrobeImage:wardrobeAssets[0].src,userPrompt};
        } else {
          const chainedBase=chainedGens.length>0?chainedGens[chainedGens.length-1].gen:null;
          const prevGen=chainedBase||node.gen||null;
          const placements=node.placements||[];
          const spatialDesc=placements.map(pl=>{
            const a=findA(pl.assetId); if(!a) return '';
            const hp=pl.px<33?'left':pl.px>66?'right':'center', vp=pl.py<33?'top':pl.py>66?'bottom':'middle';
            const sz=pl.pw<10?'small':pl.pw<25?'medium':'large';
            return `The ${a.name} should appear ${sz} at the ${vp}-${hp} of the frame.`;
          }).filter(Boolean).join(' ');
          const compositeImage=prevGen?null:await buildComposite(node,setAssets[0]||null,[...actorAssets,...propAssets]);
          const finalPrompt=[spatialDesc,userPrompt].filter(Boolean).join(' ')||(chainedBase?'Refine this frame':'');
          payload={mode:'props',compositeImage,previousGen:prevGen,userPrompt:finalPrompt};
        }
        const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data=await res.json();
        if(data.error) throw new Error(data.error);
        node.gen='data:image/png;base64,'+data.b64;
        toast('Generated!','ok');
      }catch(err){toast(err.message||'Failed','err');}
      finally{node.generating=false;renderCanvas();}
    };

    window._dlNode=nid=>{
      const node=nodes.find(n=>n.id===nid);
      if(!node?.gen){toast('Generate first','err');return;}
      Object.assign(document.createElement('a'),{href:node.gen,download:`creatorgen-${nid}.png`}).click();
    };

    // ── BOOT ─────────────────────────────────────────────────────────────────
    document.getElementById('apiDot').className='api-dot on';
    document.getElementById('apiLabel').textContent='API ready';
    renderLib();
    const cleanupCanvas=setupCanvas();
    renderCanvas();

    return()=>{
      cleanupCanvas?.();
      ['_switchCat','_doUpload','_doUrl','_delAsset','_sbDragStart',
       '_delNode','_generate','_dlNode','_ctxAddGenerate','_ctxFitView']
        .forEach(k=>delete window[k]);
      document.removeEventListener('click',()=>hideCtxMenu());
    };
  },[]);

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{
          --bg:#000;--bg-subtle:#0a0a0a;--surface:#111;--surface-raised:#161616;--surface-overlay:#1c1c1c;
          --border:rgba(255,255,255,.07);--border-hover:rgba(255,255,255,.13);--border-focus:rgba(255,255,255,.28);
          --text:#ededed;--text-secondary:#a1a1a1;--text-tertiary:#4a4a4a;
          --accent-bg:rgba(255,255,255,.05);--success:#22c55e;--error:#ef4444;
          --cat-actor:#a78bfa;--cat-wardrobe:#34d399;--cat-prop:#fb923c;--cat-set:#60a5fa;
          --r:5px;--font:'Geist',-apple-system,sans-serif;--mono:'Geist Mono',monospace;
        }
        html,body{height:100%;overflow:hidden;}
        body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:13px;-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px;}
        input,textarea,button{font-family:inherit;}
        .shell{display:grid;grid-template-rows:48px 1fr;height:100vh;}
        .body{display:grid;grid-template-columns:220px 1fr;overflow:hidden;}

        nav{display:flex;align-items:center;padding:0 16px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.9);backdrop-filter:blur(16px);z-index:100;}
        .brand{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding-right:14px;border-right:1px solid var(--border);margin-right:14px;white-space:nowrap;}
        .brand-mark{width:22px;height:22px;background:var(--text);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;}
        .sep{color:var(--text-tertiary);font-size:20px;font-weight:200;margin-right:2px;}
        .proj-input{background:none;border:none;color:var(--text-secondary);font:13px/1 var(--font);outline:none;width:160px;}
        .proj-input:focus{color:var(--text);}
        .nav-end{margin-left:auto;display:flex;align-items:center;gap:8px;}
        .nav-hint{font:11px/1 var(--mono);color:var(--text-tertiary);}
        .api-pill{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;border:1px solid var(--border);font:500 11px/1 var(--mono);color:var(--text-tertiary);}
        .api-dot{width:5px;height:5px;border-radius:50%;background:var(--text-tertiary);}
        .api-dot.on{background:var(--success);box-shadow:0 0 0 3px rgba(34,197,94,.15);animation:breathe 2.5s ease-in-out infinite;}
        @keyframes breathe{0%,100%{opacity:1}50%{opacity:.5}}

        aside{background:var(--bg-subtle);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;z-index:10;}
        .sb-header{padding:10px 10px 0;flex-shrink:0;}
        .cat-row{display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);border-radius:var(--r);padding:3px;gap:2px;margin-bottom:8px;}
        .cat-btn{padding:5px 2px;text-align:center;font:500 10px/1 var(--font);color:var(--text-tertiary);cursor:pointer;border:none;background:none;border-radius:3px;transition:all .15s;}
        .cat-btn.on{background:var(--surface-overlay);color:var(--text);}
        .cat-btn[data-c="actor"].on{color:var(--cat-actor);} .cat-btn[data-c="wardrobe"].on{color:var(--cat-wardrobe);}
        .cat-btn[data-c="prop"].on{color:var(--cat-prop);} .cat-btn[data-c="set"].on{color:var(--cat-set);}
        .add-zone{border:1px dashed var(--border);border-radius:var(--r);padding:8px;display:flex;flex-direction:column;gap:5px;margin-bottom:8px;}
        .name-field{width:100%;padding:5px 8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font:11px/1.4 var(--font);outline:none;}
        .name-field::placeholder{color:var(--text-tertiary);}
        .name-field:focus{border-color:var(--border-focus);}
        .add-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
        .mini-btn{display:flex;align-items:center;justify-content:center;gap:4px;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);font:11px/1 var(--font);cursor:pointer;transition:all .15s;}
        .mini-btn:hover{border-color:var(--border-hover);color:var(--text);}
        .sb-assets{flex:1;overflow-y:auto;padding:0 10px 10px;}
        .sb-label{display:flex;align-items:center;justify-content:space-between;font:500 10px/1 var(--mono);color:var(--text-tertiary);letter-spacing:.06em;text-transform:uppercase;margin-bottom:7px;}
        .sb-count{background:var(--surface-overlay);padding:1px 6px;border-radius:10px;}
        .asset-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
        .asset-card{border-radius:var(--r);overflow:hidden;border:1px solid var(--border);cursor:grab;position:relative;background:var(--surface);aspect-ratio:1;transition:border-color .15s,transform .12s;}
        .asset-card:hover{border-color:var(--border-hover);transform:scale(1.025);}
        .asset-card img{width:100%;height:100%;object-fit:cover;display:block;}
        .asset-cat-dot{position:absolute;top:5px;left:5px;width:5px;height:5px;border-radius:50%;}
        .asset-name{position:absolute;bottom:0;left:0;right:0;padding:3px 5px;font:9px/1.3 var(--mono);color:rgba(255,255,255,.75);background:linear-gradient(transparent,rgba(0,0,0,.65));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .asset-del{position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:3px;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08);color:var(--text-secondary);font-size:8px;cursor:pointer;display:none;align-items:center;justify-content:center;}
        .asset-card:hover .asset-del{display:flex;}
        .asset-del:hover{background:rgba(239,68,68,.8);color:#fff;}
        .no-assets{grid-column:1/-1;text-align:center;padding:16px 8px;font-size:11px;color:var(--text-tertiary);line-height:1.7;}

        /* Canvas */
        .canvas-wrap{position:relative;flex:1;overflow:hidden;background:var(--bg);background-image:radial-gradient(circle,rgba(255,255,255,.05) 1px,transparent 1px);background-size:24px 24px;cursor:default;}
        #infiniteCanvas{position:absolute;inset:0;}
        #canvasWorld{position:absolute;top:0;left:0;transform-origin:0 0;}
        #edgesSvg{position:absolute;top:0;left:0;width:9999px;height:9999px;overflow:visible;pointer-events:none;}
        #canvasNodes{position:absolute;top:0;left:0;}
        #lassoRect{position:absolute;border:1.5px dashed rgba(255,255,255,.35);background:rgba(255,255,255,.03);pointer-events:none;display:none;z-index:20;}

        /* Nodes */
        .canvas-node{position:absolute;user-select:none;border-radius:10px;border:1.5px solid var(--border);overflow:visible;transition:border-color .15s,box-shadow .15s;}
        .canvas-node:hover{border-color:var(--border-hover);}
        .canvas-node.selected{border-color:rgba(255,255,255,.45);box-shadow:0 0 0 2px rgba(255,255,255,.08);}
        .node-drag-handle{cursor:move;}
        .node-del{position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;background:var(--surface-overlay);border:1px solid var(--border-hover);color:var(--text-secondary);font-size:9px;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:20;}
        .canvas-node:hover .node-del{display:flex;}
        .node-del:hover{background:#ef4444;color:#fff;}

        /* Resize handle */
        .node-rz{position:absolute;bottom:-5px;right:-5px;width:16px;height:16px;background:rgba(255,255,255,0.9);border:2px solid var(--bg);border-radius:3px;cursor:se-resize;opacity:0;transition:opacity .15s,transform .15s,background .15s;z-index:20;pointer-events:all;}
        .canvas-node:hover .node-rz{opacity:1;}
        .node-rz:hover{opacity:1;transform:scale(1.25);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);}

        /* Asset node */
        .asset-node{background:var(--surface);}
        .node-img-wrap{overflow:hidden;border-radius:8px 8px 0 0;width:100%;}
        .node-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;}
        .node-cat-dot{position:absolute;top:6px;left:6px;width:6px;height:6px;border-radius:50%;}
        .node-label{padding:5px 8px;font:10px/1.3 var(--mono);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--surface);border-radius:0 0 8px 8px;}

        /* Generate node */
        .generate-node{width:320px;background:var(--surface-raised);}
        .gen-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);border-radius:10px 10px 0 0;}
        .gen-title{font:600 11px/1 var(--font);color:var(--text-secondary);letter-spacing:.04em;}
        .input-tags{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;border-bottom:1px solid var(--border);}
        .input-tag{padding:2px 8px;border-radius:10px;font:9px/1.4 var(--mono);color:var(--text-secondary);border:1px solid var(--border);background:var(--surface);}
        .chain-tag{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.55);background:rgba(255,255,255,.04);}
        .gen-content{min-height:70px;}
        .gen-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;}
        .gen-icon{font-size:18px;opacity:.25;}
        .gen-placeholder p{font-size:10px;color:var(--text-tertiary);text-align:center;line-height:1.6;}
        .gen-result{width:100%;height:auto;display:block;object-fit:contain;background:#000;max-height:260px;cursor:context-menu;}
        .gen-controls{padding:8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border);}
        .gen-prompt{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:6px 8px;color:var(--text);font:10px/1.5 var(--font);resize:none;outline:none;min-height:44px;}
        .gen-prompt::placeholder{color:var(--text-tertiary);}
        .gen-prompt:focus{border-color:var(--border-focus);}
        .gen-actions{display:flex;gap:6px;}
        .gen-btn{flex:1;padding:6px;border-radius:var(--r);border:none;background:var(--text);color:#000;font:600 11px/1 var(--font);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;}
        .gen-btn:hover{background:#d4d4d4;}
        .gen-btn:disabled,.gen-btn.loading{opacity:.4;cursor:not-allowed;}
        .dl-btn{padding:6px 10px;border-radius:var(--r);border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);font-size:11px;cursor:pointer;}
        .dl-btn:hover{border-color:var(--border-hover);color:var(--text);}
        .spin{width:9px;height:9px;border:1.5px solid rgba(0,0,0,.3);border-top-color:#000;border-radius:50%;animation:rot .55s linear infinite;}
        @keyframes rot{to{transform:rotate(360deg)}}
        .generating{animation:pulse 1.5s ease-in-out infinite;}
        @keyframes pulse{0%,100%{border-color:rgba(255,255,255,.2)}50%{border-color:rgba(255,255,255,.6)}}

        /* Spatial canvas */
        .spatial-hint{padding:5px 8px;font:9px/1 var(--mono);color:var(--cat-set);background:rgba(96,165,250,.06);border-bottom:1px solid rgba(96,165,250,.15);}
        .spatial-canvas{position:relative;width:100%;aspect-ratio:16/9;background-size:cover;background-position:center;border-bottom:1px solid var(--border);overflow:hidden;cursor:crosshair;}
        .sp-item{position:absolute;cursor:move;}
        .sp-item:hover{outline:1.5px solid rgba(255,255,255,.5);}
        .sp-item img{width:100%;height:auto;display:block;object-fit:contain;}
        .sp-rz{position:absolute;bottom:-4px;right:-4px;width:10px;height:10px;background:#fff;border-radius:2px;cursor:se-resize;opacity:0;}
        .sp-item:hover .sp-rz{opacity:1;}

        /* Context menu */
        #ctxMenu{position:fixed;background:var(--surface-overlay);border:1px solid var(--border-hover);border-radius:8px;padding:4px;display:none;z-index:1000;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.7);}
        .ctx-item{padding:7px 12px;border-radius:5px;font-size:12px;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;gap:8px;}
        .ctx-item:hover{background:var(--accent-bg);color:var(--text);}
        .ctx-sep{height:1px;background:var(--border);margin:3px 0;}

        .canvas-hints{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:10;pointer-events:none;}
        .hint-pill{padding:5px 12px;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:20px;font:10px/1 var(--mono);color:var(--text-tertiary);white-space:nowrap;}

        .toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(6px);background:var(--surface-overlay);border:1px solid var(--border-hover);border-radius:20px;padding:7px 14px;font-size:12px;color:var(--text-secondary);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s;box-shadow:0 8px 32px rgba(0,0,0,.8);display:flex;align-items:center;gap:7px;z-index:2000;}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
        .t-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
        input[type="file"]{display:none;}
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet"/>

      <div className="shell">
        <nav>
          <div className="brand"><div className="brand-mark">🎬</div>Creatorgen</div>
          <span className="sep">/</span>
          <input className="proj-input" id="projName" defaultValue="Untitled Project" spellCheck="false"/>
          <div className="nav-end">
            <span className="nav-hint">Drag → Lasso → Right-click → Generate</span>
            <div className="api-pill"><div className="api-dot" id="apiDot"></div><span id="apiLabel">Connecting…</span></div>
          </div>
        </nav>
        <div className="body">
          <aside>
            <div className="sb-header">
              <div className="cat-row">
                <button className="cat-btn on" data-c="actor"    onClick={()=>window._switchCat('actor')}>Actor</button>
                <button className="cat-btn"    data-c="wardrobe" onClick={()=>window._switchCat('wardrobe')}>Wrdrb</button>
                <button className="cat-btn"    data-c="prop"     onClick={()=>window._switchCat('prop')}>Prop</button>
                <button className="cat-btn"    data-c="set"      onClick={()=>window._switchCat('set')}>Set</button>
              </div>
              <div className="add-zone">
                <input className="name-field" id="nameField" placeholder="Asset name (optional)"/>
                <div className="add-row">
                  <button className="mini-btn" onClick={()=>window._doUpload()}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 9V1M3 4l3-3 3 3"/><path d="M1 11h10"/></svg>Upload
                  </button>
                  <button className="mini-btn" onClick={()=>window._doUrl()}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4.5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7.5"/><path d="M7.5 1H11v3.5M11 1L5.5 6.5"/></svg>URL
                  </button>
                </div>
              </div>
            </div>
            <div className="sb-assets">
              <div className="sb-label"><span id="catLabel">Actors</span><span className="sb-count" id="catCount">0</span></div>
              <div className="asset-grid" id="assetGrid"></div>
            </div>
          </aside>

          <div className="canvas-wrap" id="canvasWrap">
            <div id="infiniteCanvas">
              <div id="canvasWorld">
                <svg id="edgesSvg"></svg>
                <div id="canvasNodes"></div>
              </div>
            </div>
            <div id="lassoRect"></div>
            <div className="canvas-hints">
              <span className="hint-pill">Drag assets from sidebar</span>
              <span className="hint-pill">Lasso → Right-click → Add Generate</span>
              <span className="hint-pill">Right-click generated image to chain</span>
              <span className="hint-pill">Scroll to pan · Ctrl+scroll to zoom</span>
            </div>
          </div>
        </div>
      </div>

      <div id="ctxMenu">
        <div className="ctx-item" onClick={()=>window._ctxAddGenerate()}>
          <span style={{opacity:.7}}>✦</span> Add Generate Node
        </div>
        <div className="ctx-sep"></div>
        <div className="ctx-item" onClick={()=>window._ctxFitView()}>
          <span style={{opacity:.7}}>⊡</span> Fit View
        </div>
      </div>

      <div className="toast" id="toast"><div className="t-dot" id="tDot"></div><span id="tMsg"></span></div>
      <input type="file" id="fileIn" accept="image/*"/>
    </>
  );
}
