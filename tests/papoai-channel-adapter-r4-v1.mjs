import {
  normalizeExternalAgentPayload,
  redactMediaRefsForStorage
} from "../supabase/functions/_shared/papoai-agent-external-contract-v1.mjs";
import {mediaUrlAllowed} from "../supabase/functions/_shared/papoai-multimodal-v1.mjs";
import {
  fallbackTextForDelivery,
  buildPapoAiExternalDelivery
} from "../supabase/functions/_shared/papoai-channel-adapter-v1.mjs";

function assert(condition,message){
  if(!condition) throw new Error(message);
}

const audio=normalizeExternalAgentPayload({
  contact:{phone_number:"65999999999",name:"Teste"},
  session:{id:"media-audio"},
  message:{
    type:"audio",
    url:"https://media.papo.example/audio.ogg?token=secret",
    mimetype:"audio/ogg"
  },
  message_id:"m1"
});

assert(audio.messageType==="audio","audio type should be inferred");
assert(audio.mediaRefs.length===1,"audio media ref missing");
assert(audio.messageText==="[AUDIO RECEBIDO]","media-only audio must be accepted");

const stored=redactMediaRefsForStorage(audio.mediaRefs);
assert(stored.length===1&&stored[0].has_url===true,"stored media metadata missing");
assert(stored[0].url_host==="media.papo.example","media host should be preserved");
assert(!JSON.stringify(stored).includes("token=secret"),"signed media URL must never be persisted");

const image=normalizeExternalAgentPayload({
  contact:{phone_number:"65999999999"},
  session:{id:"media-image"},
  message:{
    type:"image",
    url:"https://media.papo.example/x.webp",
    mimetype:"image/webp",
    caption:"vocês têm esse?"
  },
  message_id:"m2"
});

assert(image.messageType==="image","image type should be inferred");
assert(image.mediaRefs.length===1,"image media ref missing");
assert(image.messageText==="vocês têm esse?","image caption should become trigger text");

assert(mediaUrlAllowed("https://cdn.papoai.com/a.ogg",["papoai.com"])===true,"subdomain allowlist should pass");
assert(mediaUrlAllowed("http://cdn.papoai.com/a.ogg",["papoai.com"])===false,"http media must fail");
assert(mediaUrlAllowed("https://evil.example/a.ogg",["papoai.com"])===false,"unknown host must fail");
assert(mediaUrlAllowed("https://cdn.papoai.com/a.ogg",[])===false,"empty allowlist must deny");
assert(mediaUrlAllowed("https://user@papoai.com/a.ogg",["papoai.com"])===false,"userinfo URL must fail");

const buttons=fallbackTextForDelivery("buttons",{
  text:"Como prefere pagar?",
  items:[{title:"Pix"},{title:"Dinheiro"},{title:"Cartão"}]
});
assert(buttons.includes("1. Pix")&&buttons.includes("3. Cartão"),"buttons fallback must be numbered");

const imageFallback=buildPapoAiExternalDelivery({
  requestedType:"image_caption",
  resolution:{resolved_type:"text",fallback_used:true},
  payload:{text:"Produto X",media_url:"https://example.com/x.webp"},
  sessionKey:"s1",correlationId:"c1"
});
assert(imageFallback.message.text==="Produto X","image fallback text invalid");
assert(!imageFallback.message.media_url,"fallback must not expose unsupported media");

const voice=buildPapoAiExternalDelivery({
  requestedType:"voice",
  resolution:{resolved_type:"voice",fallback_used:false},
  payload:{text:"Olá",media_url:"https://signed.example/audio.opus"},
  sessionKey:"s1",correlationId:"c2"
});
assert(voice.message.media_type==="audio"&&voice.message.voice===true,"voice envelope invalid");

console.log("papoai R4 channel/multimodal tests: ok");
