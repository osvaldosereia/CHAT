const clean=(v,max=2000)=>String(v??'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,max);

const getPath=(obj,path)=>path.split('.').reduce((cur,key)=>cur&&typeof cur==='object'?cur[key]:undefined,obj);
const pick=(obj,paths,max=2000)=>{
  for(const path of paths){
    const raw=getPath(obj,path);
    if(raw!==undefined&&raw!==null){
      const value=clean(raw,max);
      if(value) return value;
    }
  }
  return '';
};

export function normalizePhoneBR(value){
  let d=String(value??'').replace(/\D/g,'');
  if(d.startsWith('00')) d=d.slice(2);
  if(d.startsWith('0')&&(d.length===11||d.length===12)) d=d.slice(1);
  if(d.length===10||d.length===11) d='55'+d;
  if(!d.startsWith('55')||(d.length!==12&&d.length!==13)) return '';
  return '+'+d;
}

function normalizeRole(item={}){
  if(item.fromMe===true) return 'assistant';
  const raw=clean(item.role??item.from??item.sender??item.direction,60).toLowerCase();
  if(['system','developer'].includes(raw)) return 'discard';
  if(['assistant','bot','ai','out','outbound'].includes(raw)) return 'assistant';
  return 'user';
}

function parseMessages(value){
  if(value===undefined||value===null) return [];
  let raw=value;
  if(typeof raw==='string'){
    const trimmed=raw.trim();
    if(!trimmed) return [];
    try{ raw=JSON.parse(trimmed); }
    catch{ return [{role:'user',content:clean(trimmed,4000)}]; }
  }
  if(!Array.isArray(raw)) return [];
  const out=[];
  for(const item of raw){
    if(typeof item==='string'){
      const content=clean(item,4000);
      if(content) out.push({role:'user',content});
      continue;
    }
    if(!item||typeof item!=='object') continue;
    const role=normalizeRole(item);
    if(role==='discard') continue;
    const content=clean(item.content??item.text??item.message??item.body,4000);
    if(content) out.push({role,content});
  }
  return out;
}

function scanObject(value,predicate,seen=new Set()){
  if(value===null||value===undefined) return false;
  if(typeof value!=='object') return predicate('',value);
  if(seen.has(value)) return false;
  seen.add(value);
  for(const [key,val] of Object.entries(value)){
    if(predicate(key,val)) return true;
    if(val&&typeof val==='object'&&scanObject(val,predicate,seen)) return true;
  }
  return false;
}

function normalizeMediaKind(rawType,mime=''){
  const t=clean(rawType,40).toLowerCase();
  const m=clean(mime,120).toLowerCase();
  if(t.includes('audio')||t.includes('voice')||m.startsWith('audio/')) return 'audio';
  if(t.includes('image')||t.includes('photo')||m.startsWith('image/')) return 'image';
  if(t.includes('video')||m.startsWith('video/')) return 'video';
  if(t.includes('document')||t.includes('file')||m.startsWith('application/')) return 'document';
  return t||'unknown';
}

function safeMediaUrl(raw){
  const value=clean(raw,4000);
  if(!value) return '';
  try{
    const u=new URL(value);
    if(u.protocol!=='https:') return '';
    return u.toString();
  }catch{return '';}
}

export function extractMediaRefs(body={},explicitType=''){
  const refs=[];
  const seen=new Set();
  const add=(candidate={},kindHint='')=>{
    if(!candidate||typeof candidate!=='object') return;
    const mime=clean(candidate.mimetype??candidate.mime_type??candidate.mimeType??candidate.content_type??candidate.contentType,120)||null;
    const url=safeMediaUrl(candidate.media_url??candidate.url??candidate.link??candidate.download_url??candidate.downloadUrl);
    const mediaId=clean(candidate.media_id??candidate.mediaId??candidate.id,500)||null;
    const filename=clean(candidate.filename??candidate.file_name??candidate.name,300)||null;
    const caption=clean(candidate.caption??candidate.text??candidate.body,1000)||null;
    const kind=normalizeMediaKind(candidate.type??candidate.kind??kindHint??explicitType,mime||'');
    if(!url&&!mediaId) return;
    const key=[kind,url||'',mediaId||''].join('|');
    if(seen.has(key)) return;
    seen.add(key);
    refs.push({kind,url:url||null,media_id:mediaId,mime_type:mime,filename,caption});
  };

  const direct=[
    ['message',getPath(body,'message')],
    ['media',getPath(body,'media')],
    ['audio',getPath(body,'audio')],
    ['image',getPath(body,'image')],
    ['video',getPath(body,'video')],
    ['document',getPath(body,'document')],
    ['attachment',getPath(body,'attachment')],
    ['message.audio',getPath(body,'message.audio')],
    ['message.image',getPath(body,'message.image')],
    ['message.video',getPath(body,'message.video')],
    ['message.document',getPath(body,'message.document')],
    ['data.message',getPath(body,'data.message')],
    ['payload.message',getPath(body,'payload.message')]
  ];
  for(const [hint,val] of direct) add(val,hint);

  for(const path of ['attachments','message.attachments','data.attachments','payload.attachments']){
    const list=getPath(body,path);
    if(Array.isArray(list)) for(const item of list) add(item,item?.type||'attachment');
  }

  const topUrl=safeMediaUrl(pick(body,['media_url','message.media_url','url'],4000));
  if(topUrl) add({
    url:topUrl,
    type:explicitType,
    mimetype:pick(body,['mimetype','mime_type','message.mimetype','message.mime_type'],120),
    caption:pick(body,['caption','message.caption'],1000)
  },explicitType);

  return refs.slice(0,5);
}

export function normalizeExternalAgentPayload(body={}){
  if(!body||typeof body!=='object'||Array.isArray(body)) throw new Error('invalid_json');
  const rawPhone=pick(body,[
    'contact.phone_number','contact.phone_number_formatted','contact.phone','contact.number','contact.whatsapp','contact.telefone','contact.wa_id',
    'phone_number','phone','number','from'
  ],120);
  const phoneE164=normalizePhoneBR(rawPhone);
  if(!phoneE164) throw new Error('invalid_phone');

  const displayName=pick(body,[
    'contact.name','contact.pushName','contact.nome','contact.first_name','name','pushName','nome','first_name'
  ],200)||null;
  const sessionKey=pick(body,['session.uid','session.id','session.session_id','session_id','conversation_id'],300)||`phone:${phoneE164}`;
  const history=parseMessages(body.messages);
  const latestMessage=history.length?history[history.length-1]:null;
  const fallback=pick(body,['text','message','body','content','message.text','message.body','caption','message.caption'],4000);
  const externalMessageId=pick(body,['message_id','messageId','message.id','data.message.id','payload.message.id'],300)||null;
  const externalEventId=pick(body,['event_id','eventId','event.id','data.event.id','payload.event.id'],300)||null;
  let messageType=(pick(body,['message_type','type','message.type','data.message.type'],80)||'text').toLowerCase();
  const mediaRefs=extractMediaRefs(body,messageType);
  if((!messageType||messageType==='text'||messageType==='unknown')&&mediaRefs.length){
    const inferred=mediaRefs[0]?.kind;
    if(['audio','image','video','document'].includes(inferred)) messageType=inferred;
  }

  const triggerRole=latestMessage?.role||'user';
  let triggerText=latestMessage?.content||fallback;
  if(!triggerText&&mediaRefs.length){
    const caption=mediaRefs.find(x=>x.caption)?.caption||'';
    triggerText=caption||`[${String(mediaRefs[0]?.kind||messageType||'media').toUpperCase()} RECEBIDO]`;
  }
  if(!triggerText) throw new Error('empty_message');
  const messageText=triggerRole==='user'?triggerText:'';

  const rawHumanRequired=getPath(body,'session.human_required')??getPath(body,'human_required');
  const sessionHumanRequired=rawHumanRequired===true
    || ['true','1','yes','sim'].includes(clean(rawHumanRequired,20).toLowerCase());
  const sessionStatus=pick(body,['session.status','status'],80)||null;
  const sessionHumanUserId=pick(body,['session.user_id','session.assigned_user_id','user_id'],160)||null;
  const hasMedia=mediaRefs.length>0||scanObject(body,(key,val)=>{
    const k=String(key).toLowerCase();
    if(['url','mimetype','mime_type'].includes(k)&&val) return true;
    return false;
  });
  const hasReply=scanObject(body,key=>/^(quoted|reply_to|replyto|contextinfo|in_reply_to)$/i.test(String(key)));

  return {
    phoneE164,displayName,sessionKey,messageText,history,externalMessageId,externalEventId,messageType,
    mediaRefs,
    triggerRole,triggerText,sessionHumanRequired,sessionStatus,sessionHumanUserId,
    providerContext:{
      history_count:history.length,
      has_media:hasMedia,
      media_count:mediaRefs.length,
      media_kinds:[...new Set(mediaRefs.map(x=>x.kind))],
      has_reply:hasReply,
      trigger_role:triggerRole,
      session_human_required:sessionHumanRequired,
      session_status:sessionStatus,
      session_human_user_id:sessionHumanUserId
    }
  };
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function stableProviderEventKey(input={}){
  const stable=clean(input.externalMessageId??input.externalEventId,500);
  if(stable) return `provider:${await sha256Hex(stable)}`;
  const basis=[clean(input.sessionKey,500),clean(input.messageText,4000),clean(input.occurredBucket,80)].join('|');
  return `fallback:${await sha256Hex(basis)}`;
}

export function isReservedLabHandoff(messageText){
  return clean(messageText,200).toUpperCase()==='TESTE_HANDOFF_DONA_ANTONIA';
}

export function sanitizeOutboundText(value){
  let text=clean(value,4000).replace(/\[HANDOFF\]/gi,'').trim();
  text=text.replace(/\{\s*"(?:tool|function|arguments)"\s*:\s*"[^"]*"(?:\s*,\s*"[^"]+"\s*:\s*[^}]*)?\}/gi,'');
  return text.replace(/\s+/g,' ').trim();
}

export function buildLabTextResponse({text,sessionKey,correlationId}){
  return {message:{text:sanitizeOutboundText(text)},handoff:false,session_id:sessionKey,correlation_id:correlationId};
}

export function buildLabHandoffResponse({text,sessionKey,correlationId,reason}){
  return {message:{text:sanitizeOutboundText(text)},handoff:true,reason,session_id:sessionKey,correlation_id:correlationId};
}

export function buildLabSilentResponse({sessionKey,correlationId,reason,pausedUntil=null,handoff=true}){
  const out={message:null,silent:true,handoff:Boolean(handoff),reason,session_id:sessionKey,correlation_id:correlationId};
  if(pausedUntil) out.paused_until=pausedUntil;
  return out;
}
