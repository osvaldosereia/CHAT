import {
  normalizeExternalAgentPayload,
  buildLabTextResponse,
  buildLabHandoffResponse,
  buildLabSilentResponse
} from "../supabase/functions/_shared/papoai-agent-external-contract-v1.mjs";
import {
  fallbackTextForDelivery,
  buildPapoAiExternalDelivery
} from "../supabase/functions/_shared/papoai-channel-adapter-v1.mjs";

function assert(condition,message){
  if(!condition) throw new Error(message);
}

const normalized=normalizeExternalAgentPayload({
  contact:{phone_number:"65999999999",name:"Teste R7"},
  session:{id:"r7-session",human_required:false},
  message:{type:"audio",media_url:"https://media.example.test/audio.ogg",mime_type:"audio/ogg"},
  messages:[{role:"user",content:"teste"}]
});
assert(normalized.phoneE164==="+5565999999999","phone normalization");
assert(normalized.sessionKey==="r7-session","session normalization");
assert(Array.isArray(normalized.mediaRefs)&&normalized.mediaRefs[0]?.kind==="audio","audio media extraction");

const text=buildLabTextResponse({text:"R7 texto",sessionKey:"s1",correlationId:"c1"});
assert(text.message?.text==="R7 texto"&&text.handoff===false,"text lab shape");

const handoff=buildLabHandoffResponse({
  text:"Vou transferir",sessionKey:"s1",correlationId:"c1",reason:"r7"
});
assert(handoff.handoff===true&&handoff.message?.text,"handoff lab shape");

const silent=buildLabSilentResponse({
  sessionKey:"s1",correlationId:"c1",reason:"r7_silent",handoff:false
});
assert(silent.silent===true&&silent.message===null&&silent.handoff===false,"silent lab shape");

const buttonsFallback=fallbackTextForDelivery("buttons",{
  text:"Escolha:",
  buttons:[{title:"Confirmar"},{title:"Trocar"}]
});
assert(buttonsFallback.includes("1. Confirmar")&&buttonsFallback.includes("2. Trocar"),"button fallback");

const listFallback=buildPapoAiExternalDelivery({
  requestedType:"list",
  resolution:{resolved_type:"text",fallback_used:true},
  payload:{text:"Cestas",items:[{title:"Mini"},{title:"Pequena"}]},
  sessionKey:"s1",correlationId:"c1"
});
assert(listFallback.message?.text.includes("1. Mini"),"list fallback delivery");

const flowFallback=buildPapoAiExternalDelivery({
  requestedType:"flow",
  resolution:{resolved_type:"text",fallback_used:true},
  payload:{fallback_text:"Me passe seu endereço por aqui."},
  sessionKey:"s1",correlationId:"c1"
});
assert(flowFallback.message?.text.includes("endereço"),"flow fallback delivery");

console.log("papoai R7 channel contract tests: ok");
