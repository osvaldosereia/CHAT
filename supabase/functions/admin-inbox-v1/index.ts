import { withSupabase } from "npm:@supabase/server@1.7.0";

type Json = Record<string, unknown>;
type AdminClient = any;

function json(data: Json, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function cors(req: Request): HeadersInit {
  const configured = (Deno.env.get("ADMIN_ALLOWED_ORIGINS") ?? "*")
    .split(",").map(v => v.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const allow = configured.includes("*") || configured.includes(origin)
    ? (origin || "*")
    : (configured[0] || "*");
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,apikey",
    "vary": "Origin",
  };
}

function bodyText(v: unknown, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function userId(ctx: any): string | null {
  return ctx.userClaims?.sub ?? ctx.userClaims?.id ?? null;
}

async function membership(admin: AdminClient, uid: string, orgSlug: string) {
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id,name,slug,status")
    .eq("slug", orgSlug)
    .eq("status", "active")
    .maybeSingle();
  if (orgError) throw orgError;
  if (!org) return null;

  const { data: member, error } = await admin
    .from("organization_memberships")
    .select("role,status")
    .eq("organization_id", org.id)
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!member) return null;
  return { organization: org, role: member.role };
}

function canOperate(role: string) {
  return ["owner","admin","manager","agent"].includes(role);
}

function canOverride(role: string) {
  return ["owner","admin","manager"].includes(role);
}

async function auditAssignment(
  admin: AdminClient,
  organizationId: string,
  conversationId: string,
  actorUserId: string,
  assignedUserId: string | null,
  eventType: string,
  metadata: Json = {},
) {
  const { error } = await admin.from("conversation_assignment_events").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    actor_user_id: actorUserId,
    assigned_user_id: assignedUserId,
    event_type: eventType,
    metadata,
  });
  if (error) throw error;
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ ok:false,error:"method_not_allowed" },405,headers);

  const uid = userId(ctx);
  if (!uid) return json({ ok:false,error:"unauthorized" },401,headers);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = bodyText(body.action, 64);
  const orgSlug = bodyText(body.organizationSlug, 80);
  if (!orgSlug) return json({ ok:false,error:"organization_required" },400,headers);

  const access = await membership(ctx.supabaseAdmin, uid, orgSlug);
  if (!access) return json({ ok:false,error:"forbidden" },403,headers);

  const admin = ctx.supabaseAdmin;
  const orgId = access.organization.id;
  const role = access.role;

  const { data: inboxModule, error: inboxModuleError } = await admin
    .from("organization_modules")
    .select("enabled")
    .eq("organization_id", orgId)
    .eq("module_key", "human_inbox")
    .maybeSingle();

  if (inboxModuleError) throw inboxModuleError;
  if (!inboxModule?.enabled) {
    return json({ ok:false, error:"human_inbox_disabled" }, 403, headers);
  }

  if (action === "me") {
    return json({
      ok:true,
      user:{ id:uid, email:ctx.userClaims?.email ?? null, role },
      organization:access.organization,
    },200,headers);
  }

  if (action === "list_conversations") {
    const statuses = Array.isArray(body.statuses)
      ? body.statuses.filter((s:any)=>["open","waiting_customer","waiting_human","human_active","closed"].includes(s))
      : ["waiting_human","human_active","open"];

    const limit = Math.min(Math.max(Number(body.limit)||30,1),60);
    const { data: rows, error } = await admin
      .from("conversations")
      .select("id,customer_id,status,assigned_user_id,channel,started_at,last_message_at")
      .eq("organization_id",orgId)
      .in("status",statuses)
      .order("last_message_at",{ascending:false})
      .limit(limit);
    if (error) throw error;

    const customerIds=[...new Set((rows??[]).map((r:any)=>r.customer_id).filter(Boolean))];
    const customerMap=new Map<string,any>();
    if(customerIds.length){
      const {data:customers,error:customerError}=await admin
        .from("customers")
        .select("id,display_name,first_name,status")
        .in("id",customerIds);
      if(customerError) throw customerError;
      for(const customer of customers??[]) customerMap.set(customer.id,customer);
    }

    const ids=(rows??[]).map((r:any)=>r.id);
    const lastMessageMap=new Map<string,any>();
    if(ids.length){
      const {data:msgs,error:msgError}=await admin
        .from("messages")
        .select("conversation_id,sender_type,body_text,created_at")
        .in("conversation_id",ids)
        .order("created_at",{ascending:false})
        .limit(Math.min(ids.length*4,240));
      if(msgError) throw msgError;
      for(const msg of msgs??[]){
        if(!lastMessageMap.has(msg.conversation_id)) lastMessageMap.set(msg.conversation_id,msg);
      }
    }

    return json({
      ok:true,
      conversations:(rows??[]).map((r:any)=>({
        ...r,
        customer:r.customer_id?customerMap.get(r.customer_id)??null:null,
        lastMessage:lastMessageMap.get(r.id)??null,
      })),
    },200,headers);
  }

  const conversationId = bodyText(body.conversationId, 64);
  if (!conversationId) return json({ok:false,error:"conversation_required"},400,headers);

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("*")
    .eq("id",conversationId)
    .eq("organization_id",orgId)
    .maybeSingle();
  if(conversationError) throw conversationError;
  if(!conversation) return json({ok:false,error:"conversation_not_found"},404,headers);

  if (action === "get_conversation") {
    const [messagesResult, cartResult, ordersResult] = await Promise.all([
      admin.from("messages")
        .select("id,sender_type,sender_id,message_type,body_text,payload,created_at")
        .eq("conversation_id",conversationId)
        .order("created_at",{ascending:true})
        .limit(300),
      admin.from("carts")
        .select("id,status,total_cents,updated_at")
        .eq("conversation_id",conversationId)
        .order("created_at",{ascending:false})
        .limit(3),
      conversation.customer_id
        ? admin.from("orders")
            .select("id,order_number,status,total_cents,created_at,confirmed_at,delivered_at")
            .eq("customer_id",conversation.customer_id)
            .order("created_at",{ascending:false})
            .limit(10)
        : Promise.resolve({data:[],error:null}),
    ]);
    if(messagesResult.error) throw messagesResult.error;
    if(cartResult.error) throw cartResult.error;
    if(ordersResult.error) throw ordersResult.error;

    let customer=null;
    let identities:any[]=[];
    let addresses:any[]=[];
    if(conversation.customer_id){
      const [customerResult,identitiesResult,addressesResult]=await Promise.all([
        admin.from("customers").select("*").eq("id",conversation.customer_id).maybeSingle(),
        admin.from("customer_identities")
          .select("id,kind,normalized_value,is_primary,verified_at")
          .eq("customer_id",conversation.customer_id),
        admin.from("customer_addresses")
          .select("id,label,recipient_name,street,number,complement,district,city,state,is_default,active")
          .eq("customer_id",conversation.customer_id)
          .eq("active",true),
      ]);
      if(customerResult.error) throw customerResult.error;
      if(identitiesResult.error) throw identitiesResult.error;
      if(addressesResult.error) throw addressesResult.error;
      customer=customerResult.data;
      identities=identitiesResult.data??[];
      addresses=addressesResult.data??[];
    }

    return json({
      ok:true,
      conversation,
      messages:messagesResult.data??[],
      customer,
      identities,
      addresses,
      carts:cartResult.data??[],
      orders:ordersResult.data??[],
    },200,headers);
  }

  if (!canOperate(role)) return json({ok:false,error:"read_only_role"},403,headers);

  if (action === "claim") {
    if(conversation.assigned_user_id && conversation.assigned_user_id!==uid && !canOverride(role)){
      return json({ok:false,error:"already_assigned"},409,headers);
    }
    const {error}=await admin.from("conversations").update({
      assigned_user_id:uid,
      status:"human_active",
      last_message_at:new Date().toISOString(),
    }).eq("id",conversationId).eq("organization_id",orgId);
    if(error) throw error;
    await auditAssignment(admin,orgId,conversationId,uid,uid,"assigned",{previous:conversation.assigned_user_id});
    return json({ok:true,status:"human_active",assignedUserId:uid},200,headers);
  }

  if (action === "release") {
    if(conversation.assigned_user_id && conversation.assigned_user_id!==uid && !canOverride(role)){
      return json({ok:false,error:"not_assigned_to_you"},403,headers);
    }
    const {error}=await admin.from("conversations").update({
      assigned_user_id:null,
      status:"open",
      last_message_at:new Date().toISOString(),
    }).eq("id",conversationId).eq("organization_id",orgId);
    if(error) throw error;
    await auditAssignment(admin,orgId,conversationId,uid,null,"released");
    return json({ok:true,status:"open"},200,headers);
  }

  if (action === "close") {
    if(conversation.assigned_user_id && conversation.assigned_user_id!==uid && !canOverride(role)){
      return json({ok:false,error:"not_assigned_to_you"},403,headers);
    }
    const {error}=await admin.from("conversations").update({
      status:"closed",
      closed_at:new Date().toISOString(),
      last_message_at:new Date().toISOString(),
    }).eq("id",conversationId).eq("organization_id",orgId);
    if(error) throw error;
    await auditAssignment(admin,orgId,conversationId,uid,conversation.assigned_user_id,"closed");
    return json({ok:true,status:"closed"},200,headers);
  }

  if (action === "send_message") {
    if(conversation.assigned_user_id && conversation.assigned_user_id!==uid && !canOverride(role)){
      return json({ok:false,error:"not_assigned_to_you"},403,headers);
    }
    const message=bodyText(body.text,2000);
    if(!message) return json({ok:false,error:"message_required"},400,headers);

    if(!conversation.assigned_user_id){
      await admin.from("conversations").update({
        assigned_user_id:uid,
        status:"human_active",
      }).eq("id",conversationId).eq("organization_id",orgId);
      await auditAssignment(admin,orgId,conversationId,uid,uid,"assigned",{automatic:true});
    }

    const {data:created,error}=await admin.from("messages").insert({
      organization_id:orgId,
      conversation_id:conversationId,
      sender_type:"human",
      sender_id:uid,
      message_type:"text",
      body_text:message,
    }).select("id,sender_type,sender_id,message_type,body_text,payload,created_at").single();
    if(error) throw error;

    await admin.from("conversations").update({
      status:"human_active",
      assigned_user_id:uid,
      last_message_at:new Date().toISOString(),
    }).eq("id",conversationId).eq("organization_id",orgId);

    return json({ok:true,message:created},201,headers);
  }

  return json({ok:false,error:"unknown_action"},400,headers);
});

export default {
  fetch: async (req: Request) => {
    const headers=cors(req);
    if(req.method==="OPTIONS") return new Response(null,{status:204,headers});
    try {
      const out=await handler(req);
      const h=new Headers(out.headers);
      Object.entries(headers).forEach(([k,v])=>typeof v==="string"&&h.set(k,v));
      return new Response(out.body,{status:out.status,statusText:out.statusText,headers:h});
    } catch(error) {
      console.error("admin-inbox-v1",error);
      return json({ok:false,error:"internal_error"},500,headers);
    }
  }
};