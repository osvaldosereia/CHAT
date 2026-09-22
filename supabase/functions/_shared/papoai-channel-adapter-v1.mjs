const clean=(v,max=4000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function numberedOptions(items=[]){
  return (Array.isArray(items)?items:[]).slice(0,10).map((item,index)=>{
    const title=clean(item?.title??item?.label??item?.name??item?.text,180)||`Opção ${index+1}`;
    const desc=clean(item?.description??item?.subtitle,240);
    return `${index+1}. ${title}${desc?` — ${desc}`:''}`;
  }).join('\n');
}

export function fallbackTextForDelivery(requestedType,payload={}){
  const base=clean(payload?.text??payload?.body??payload?.caption,3500);
  if(requestedType==='buttons'||requestedType==='list'){
    const choices=numberedOptions(payload?.items??payload?.buttons??payload?.options);
    return [base,choices,choices?'Pode responder pelo número da opção.':''].filter(Boolean).join('\n\n');
  }
  if(requestedType==='flow'){
    return base||clean(payload?.fallback_text,3500)||'Me passe os dados por aqui e eu continuo com você.';
  }
  if(['image','image_caption','product','product_list'].includes(requestedType)){
    return base||clean(payload?.fallback_text,3500)||'Posso te passar os detalhes por aqui.';
  }
  if(requestedType==='voice'){
    return base||clean(payload?.fallback_text,3500);
  }
  return base;
}

export function buildPapoAiExternalDelivery({
  requestedType='text',resolution={},payload={},sessionKey,correlationId,handoff=false,reason=null
}={}){
  const resolved=String(resolution?.resolved_type||requestedType||'text');
  const fallbackUsed=resolution?.fallback_used===true;
  if(resolved==='silent'){
    return {message:null,silent:true,handoff:Boolean(handoff),reason,session_id:sessionKey,correlation_id:correlationId};
  }
  if(resolved==='handoff'||resolved==='handoff_text_fallback'){
    return {
      message:{text:fallbackTextForDelivery('text',payload)},
      handoff:true,reason:reason||'handoff',
      session_id:sessionKey,correlation_id:correlationId
    };
  }
  if(resolved==='no_op'){
    return {message:null,silent:true,handoff:false,reason:'channel_no_op',session_id:sessionKey,correlation_id:correlationId};
  }

  const text=fallbackUsed
    ? fallbackTextForDelivery(requestedType,payload)
    : fallbackTextForDelivery(resolved,payload);
  const message={text};

  if(!fallbackUsed&&['image','image_caption','product'].includes(resolved)&&payload?.media_url){
    message.media_url=String(payload.media_url);
  }
  if(!fallbackUsed&&resolved==='voice'&&payload?.media_url){
    message.media_url=String(payload.media_url);
    message.media_type='audio';
    message.voice=true;
  }

  // Buttons/list/flow are intentionally not emitted to PapoAI until their exact external-agent
  // response shapes are physically verified. A verified capability without a known shape must
  // still fall back at the Edge integration layer.
  if(['buttons','list','flow'].includes(resolved)){
    message.text=fallbackTextForDelivery(resolved,payload);
  }

  return {
    message,handoff:false,reason,
    session_id:sessionKey,correlation_id:correlationId,
    channel_resolution:{
      requested_type:requestedType,
      resolved_type:resolved,
      fallback_used:fallbackUsed
    }
  };
}
