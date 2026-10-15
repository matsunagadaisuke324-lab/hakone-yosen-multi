import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,setDoc,updateDoc,collection,onSnapshot,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const names=['中央学院','東海','神奈川','東洋','日本体育','東京国際','山梨学院','東京農業','大東文化','立教','法政','明治','専修','国士舘'];
const $=id=>document.getElementById(id), QUEUE_KEY='hakoneMultiQueueV2', TEAM_KEY='hakoneMultiSelectedTeam';
let db,auth,user=null,events=[],queue=[],unsubscribe=null,sending=false,offset=0,offsetKnown=false;
try {queue=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');if(!Array.isArray(queue))queue=[];}catch{queue=[];}
const saveQueue=()=>{localStorage.setItem(QUEUE_KEY,JSON.stringify(queue));$('queueCount').textContent=queue.length;};
const selected=()=> $('team').value;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=ms=>Number.isFinite(ms)?`${String(Math.floor(Math.max(0,ms)/60000)).padStart(2,'0')}:${(Math.max(0,ms)%60000/1000).toFixed(1).padStart(4,'0')}`:'—';
function toast(s){const el=$('toast');el.textContent=s;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',3500);}
function setStatus(s){$('connection').textContent=s;}
$('team').innerHTML='<option value="">大学を選択してください</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}大学</option>`).join('');
$('team').value=localStorage.getItem(TEAM_KEY)||'';
$('team').onchange=()=>{localStorage.setItem(TEAM_KEY,selected());render();};
function active(){return events.filter(e=>e.status==='active'&&names.includes(e.university)&&Number.isFinite(e.capturedAtMs));}
function baseline(){const a=active();return a.length?Math.min(...a.map(e=>e.capturedAtMs)):null;}
function render(){const a=active(),b=baseline(),team=selected(),mine=a.filter(e=>e.university===team).sort((x,y)=>x.capturedAtMs-y.capturedAtMs);
 $('allCount').textContent=a.length;$('myCount').textContent=mine.length;saveQueue();$('goal').disabled=!user||!team||mine.length+queue.filter(e=>e.university===team).length>=10;
 $('operatorTitle').textContent=team?`${team}大学 GOAL`:'大学を選択してください';
 const scores=names.map(n=>{const list=a.filter(e=>e.university===n).sort((x,y)=>x.capturedAtMs-y.capturedAtMs||x.id.localeCompare(y.id));return {n,count:list.length,score:list.slice(0,10).reduce((s,e)=>s+(e.capturedAtMs-b),0)};});
 $('completed').innerHTML=scores.filter(x=>x.count>=10).sort((x,y)=>x.score-y.score).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.n)}</td><td>${x.count}/10</td><td>${fmt(x.score)}</td></tr>`).join('')||'<tr><td colspan="4">まだありません</td></tr>';
 $('progress').innerHTML=scores.filter(x=>x.count<10).sort((x,y)=>y.count-x.count||x.score-y.score).map(x=>`<tr><td>${esc(x.n)}</td><td>${x.count}/10</td><td>${x.count?fmt(x.score):'—'}</td></tr>`).join('');
 $('myLog').innerHTML=mine.map((e,i)=>`<div class="entry"><span>${i+1}人目 / ${fmt(e.capturedAtMs-b)}</span><span class="muted">${new Date(e.capturedAtMs).toLocaleTimeString('ja-JP')}</span></div>`).join('')||'<p class="muted">記録なし</p>';
 $('allLog').innerHTML=a.slice().sort((x,y)=>x.capturedAtMs-y.capturedAtMs).map(e=>`<div class="entry"><span>${esc(e.university)} / ${fmt(e.capturedAtMs-b)}</span><span class="row"><select data-edit="${esc(e.id)}" aria-label="大学変更">${names.map(n=>`<option value="${esc(n)}" ${n===e.university?'selected':''}>${esc(n)}</option>`).join('')}</select><button class="danger" data-delete="${esc(e.id)}">削除</button></span></div>`).join('')||'<p class="muted">記録なし</p>';
 document.querySelectorAll('[data-edit]').forEach(el=>el.onchange=async()=>{const event=events.find(e=>e.id===el.dataset.edit);if(!event||!confirm(`${event.university} → ${el.value} に変更しますか？`)){render();return;}try{await updateDoc(doc(db,'events',event.id),{university:el.value,editedAt:serverTimestamp(),editedBy:user.uid});toast('変更しました');}catch(err){toast('変更失敗: '+err.message);render();}});
 document.querySelectorAll('[data-delete]').forEach(el=>el.onclick=async()=>{if(!confirm('このGOAL記録を削除しますか？'))return;try{await updateDoc(doc(db,'events',el.dataset.delete),{status:'deleted',editedAt:serverTimestamp(),editedBy:user.uid});toast('削除しました');}catch(err){toast('削除失敗: '+err.message);}});
}
const configOK=!!firebaseConfig.apiKey&&!firebaseConfig.apiKey.includes('REPLACE_ME');
if(!configOK){setStatus('Firebaseの設定が未入力です');toast('firebase-config.js に接続情報を設定してください');}
else{try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);onAuthStateChanged(auth,async u=>{if(unsubscribe){unsubscribe();unsubscribe=null;}user=u;if(!u){setStatus('自動認証中…');try{await signInAnonymously(auth);}catch(e){setStatus('認証エラー: '+e.message);}return;}
 setStatus('接続中…');unsubscribe=onSnapshot(collection(db,'events'),snap=>{events=snap.docs.map(d=>({id:d.id,...d.data()}));setStatus('🟢 リアルタイム接続中');render();resend();},err=>setStatus('🔴 データ受信エラー: '+err.message));render();await syncClock();resend();},e=>setStatus('認証エラー: '+e.message));}catch(e){setStatus('初期化エラー: '+e.message);}}
async function syncClock(){if(!user)return;try{const samples=[];for(let i=0;i<3;i++){const t0=Date.now(),ref=doc(collection(db,'clockSync'));await setDoc(ref,{uid:user.uid,serverTime:serverTimestamp()});const snap=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js').then(m=>m.getDoc(ref));const t1=Date.now(),ts=snap.data()?.serverTime;if(ts)samples.push({rtt:t1-t0,delta:ts.toMillis()-(t0+t1)/2});}samples.sort((x,y)=>x.rtt-y.rtt);if(samples.length){offset=samples[0].delta;offsetKnown=true;$('syncInfo').textContent=`時計補正 ${Math.round(offset)}ms / 通信往復 ${samples[0].rtt}ms（推定）`;}}catch(e){$('syncInfo').textContent='時計補正できません: '+e.message;}}
$('syncClock').onclick=syncClock;
$('goal').onclick=()=>{const team=selected();if(!user||!team)return toast('大学を選択してください');const count=active().filter(e=>e.university===team).length+queue.filter(e=>e.university===team).length;if(count>=10)return toast('この大学は10人到達済みです');const local=Date.now();queue.push({id:crypto.randomUUID(),university:team,capturedAtMs:local+offset,localCapturedAtMs:local,clockOffsetMs:offset,clockOffsetKnown:offsetKnown,uid:user.uid,status:'active'});saveQueue();render();toast('GOALを端末に記録しました');resend();};
async function resend(){if(sending||!user||!db||!navigator.onLine)return;sending=true;try{for(const e of [...queue]){try{const {id,...data}=e;await setDoc(doc(db,'events',id),{...data,createdAt:serverTimestamp()});queue=queue.filter(x=>x.id!==id);saveQueue();}catch(err){toast('未送信として保存中: '+err.message);break;}}}finally{sending=false;render();}}
$('resend').onclick=async()=>{await resend();toast(queue.length?`未送信 ${queue.length} 件`:'すべて送信済みです');};window.addEventListener('online',resend);
setInterval(()=>{const b=baseline();$('timer').textContent=b===null?'00:00.0':fmt(Date.now()+offset-b);},100);
function csv(name,rows){const contents='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportHistory').onclick=()=>{const b=baseline();csv('予選会Multi_全履歴.csv',[['ID','大学','先頭差秒','記録時刻','担当UID','状態','最終編集UID','時計補正済み'],...events.map(e=>[e.id,e.university,b!==null&&Number.isFinite(e.capturedAtMs)?((e.capturedAtMs-b)/1000).toFixed(3):'',Number.isFinite(e.capturedAtMs)?new Date(e.capturedAtMs).toISOString():'',e.uid,e.status,e.editedBy||'',e.clockOffsetKnown])]);};
$('exportRank').onclick=()=>{const a=active(),b=baseline(),teams=names.map(n=>{const x=a.filter(e=>e.university===n).sort((p,q)=>p.capturedAtMs-q.capturedAtMs);return {n,count:x.length,score:x.slice(0,10).reduce((s,e)=>s+e.capturedAtMs-b,0)};}).sort((x,y)=>(y.count>=10)-(x.count>=10)||x.score-y.score);csv('予選会Multi_順位.csv',[['大学','人数','合計差秒','10人完了'],...teams.map(x=>[x.n,x.count,x.count?(x.score/1000).toFixed(3):'',x.count>=10?'はい':'いいえ'])]);};
render();
