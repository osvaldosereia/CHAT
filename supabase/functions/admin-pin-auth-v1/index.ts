import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS=new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "https://ssbesxgaijknwsjbsbcz.supabase.co"
]);
const cors=(origin:string)=>({
  "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://donaantonia.com.br",
  "Access-Control-Allow-Headers":"apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin",
});
const json=(origin:string,body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store",...extra}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,max);
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}

Deno.serve(async(req:Request)=>{
  const origin=clean(req.headers.get("origin"),200);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json(origin,{ok:false,error:"method_not_allowed"},405);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(origin,{ok:false,error:"origin_not_allowed"},403);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json(origin,{ok:false,error:"server_config"},500);
  let body:any={};
  try{body=await req.json()}catch{return json(origin,{ok:false,error:"invalid_json"},400)}
  const pin=clean(body?.pin,12);
  if(!/^\d{6}$/.test(pin))return json(origin,{ok:false,error:"invalid_pin_format"},400);

  const forwarded=clean(req.headers.get("x-forwarded-for"),200).split(",")[0]?.trim();
  const ip=clean(req.headers.get("cf-connecting-ip")||forwarded||"unknown",120);
  const ua=clean(req.headers.get("user-agent"),500);
  const fingerprint=await sha256(`${ip}|${ua}`);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:check,error:checkError}=await sb.rpc("verify_admin_pin_access_v1",{p_pin:pin,p_fingerprint:fingerprint});
  if(checkError)return json(origin,{ok:false,error:"pin_check_failed"},500);
  if(check?.allowed!==true){
    const retry=Math.max(0,Number(check?.retry_after_seconds||0));
    return json(origin,{ok:false,error:check?.reason||"invalid_pin",remaining_attempts:check?.remaining_attempts??null,retry_after_seconds:retry},retry>0?429:401,retry>0?{"Retry-After":String(retry)}:{});
  }

  const {data:owner,error:ownerError}=await sb.from("admin_users").select("user_id").eq("role","owner").eq("is_active",true).limit(1).maybeSingle();
  if(ownerError||!owner?.user_id)return json(origin,{ok:false,error:"owner_unavailable"},500);
  const {data:userData,error:userError}=await sb.auth.admin.getUserById(owner.user_id);
  const email=userData?.user?.email;
  if(userError||!email)return json(origin,{ok:false,error:"owner_auth_unavailable"},500);

  const {data:link,error:linkError}=await sb.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo:"https://donaantonia.com.br/admin/"}});
  const tokenHash=link?.properties?.hashed_token;
  if(linkError||!tokenHash)return json(origin,{ok:false,error:"session_bootstrap_failed"},500);
  return json(origin,{ok:true,token_hash:tokenHash,verification_type:"email"},200);
});
