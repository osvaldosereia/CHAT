import { withSupabase } from "npm:@supabase/server@1.7.0";

type Json = Record<string, unknown>;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

function response(data: Json, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(req: Request): HeadersInit {
  const configured = (Deno.env.get("CHAT_ALLOWED_ORIGINS") ?? "*")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin =
    configured.includes("*") || configured.includes(origin) ? origin || "*" : configured[0] || "*";

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-chat-session-token",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readBody(req: Request): Promise<Json> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function textValue(value: unknown, max = MAX_MESSAGE_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

const coreHandler = withSupabase(
  { auth: "none" },
  async (req, ctx) => {
    const admin = ctx.supabaseAdmin;

    if (req.method === "GET") {
      return response({
        ok: true,
        service: "chat-gateway-v1",
        version: 1,
      });
    }

    if (req.method !== "POST") {
      return response({ ok: false, error: "method_not_allowed" }, 405);
    }

    const body = await readBody(req);
    const action = textValue(body.action, 64);

    if (action === "start_session") {
      const organizationSlug = textValue(body.organizationSlug, 80);
      if (!organizationSlug) {
        return response({ ok: false, error: "organization_required" }, 400);
      }

      const { data: organization, error: orgError } = await admin
        .from("organizations")
        .select("id,name,slug,status")
        .eq("slug", organizationSlug)
        .eq("status", "active")
        .maybeSingle();

      if (orgError) throw orgError;
      if (!organization) {
        return response({ ok: false, error: "organization_not_found" }, 404);
      }

      const { data: chatModule, error: moduleError } = await admin
        .from("organization_modules")
        .select("enabled")
        .eq("organization_id", organization.id)
        .eq("module_key", "chat")
        .maybeSingle();

      if (moduleError) throw moduleError;
      if (!chatModule?.enabled) {
        return response({ ok: false, error: "chat_disabled" }, 403);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({
          organization_id: organization.id,
          channel: "web",
          status: "open",
        })
        .select("id,started_at")
        .single();

      if (conversationError) throw conversationError;

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

      const { data: session, error: sessionError } = await admin
        .from("public_chat_sessions")
        .insert({
          organization_id: organization.id,
          conversation_id: conversation.id,
          token_hash: tokenHash,
          status: "active",
          expires_at: expiresAt,
        })
        .select("id,expires_at")
        .single();

      if (sessionError) {
        await admin.from("conversations").delete().eq("id", conversation.id);
        throw sessionError;
      }

      const welcome =
        "Oi 😊 Eu sou a assistente virtual da Dona Antônia. Posso montar seu pedido por aqui. O que você está procurando hoje?";

      await admin.from("messages").insert({
        organization_id: organization.id,
        conversation_id: conversation.id,
        sender_type: "assistant",
        message_type: "text",
        body_text: welcome,
      });

      await admin.from("customer_events").insert({
        organization_id: organization.id,
        conversation_id: conversation.id,
        event_type: "conversation.started",
        data: { channel: "web" },
      });

      return response({
        ok: true,
        session: {
          id: session.id,
          token,
          expiresAt: session.expires_at,
          conversationId: conversation.id,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        messages: [
          {
            senderType: "assistant",
            messageType: "text",
            bodyText: welcome,
          },
        ],
      }, 201);
    }

    const token = textValue(req.headers.get("x-chat-session-token"), 256);
    if (!token) {
      return response({ ok: false, error: "session_token_required" }, 401);
    }

    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    const { data: session, error: sessionError } = await admin
      .from("public_chat_sessions")
      .select("id,organization_id,conversation_id,customer_id,status,expires_at")
      .eq("token_hash", tokenHash)
      .eq("status", "active")
      .gt("expires_at", now)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return response({ ok: false, error: "invalid_or_expired_session" }, 401);
    }

    await admin
      .from("public_chat_sessions")
      .update({ last_seen_at: now })
      .eq("id", session.id);

    if (action === "get_messages") {
      const { data: messages, error } = await admin
        .from("messages")
        .select("id,sender_type,message_type,body_text,payload,created_at")
        .eq("conversation_id", session.conversation_id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;

      return response({
        ok: true,
        conversationId: session.conversation_id,
        messages: messages ?? [],
      });
    }

    if (action === "send_message") {
      const messageText = textValue(body.text);
      const clientMessageId = textValue(body.clientMessageId, 120);

      if (!messageText) {
        return response({ ok: false, error: "message_required" }, 400);
      }
      if (!clientMessageId) {
        return response({ ok: false, error: "client_message_id_required" }, 400);
      }

      const insertPayload = {
        organization_id: session.organization_id,
        conversation_id: session.conversation_id,
        sender_type: "customer",
        message_type: "text",
        body_text: messageText,
        client_message_id: clientMessageId,
      };

      let inserted = true;
      let { data: message, error: messageError } = await admin
        .from("messages")
        .insert(insertPayload)
        .select("id,sender_type,message_type,body_text,payload,created_at")
        .single();

      if (messageError?.code === "23505") {
        inserted = false;
        const existing = await admin
          .from("messages")
          .select("id,sender_type,message_type,body_text,payload,created_at")
          .eq("conversation_id", session.conversation_id)
          .eq("client_message_id", clientMessageId)
          .single();

        message = existing.data;
        messageError = existing.error;
      }

      if (messageError) throw messageError;

      if (inserted) {
        await Promise.all([
          admin
            .from("conversations")
            .update({ last_message_at: now })
            .eq("id", session.conversation_id),
          admin.from("customer_events").insert({
            organization_id: session.organization_id,
            customer_id: session.customer_id,
            conversation_id: session.conversation_id,
            event_type: "message.received",
            data: { message_type: "text" },
          }),
        ]);
      }

      return response({
        ok: true,
        message,
        duplicate: !inserted,
      });
    }

    if (action === "request_human") {
      const { error: updateError } = await admin
        .from("conversations")
        .update({
          status: "waiting_human",
          last_message_at: now,
        })
        .eq("id", session.conversation_id);

      if (updateError) throw updateError;

      await admin.from("customer_events").insert({
        organization_id: session.organization_id,
        customer_id: session.customer_id,
        conversation_id: session.conversation_id,
        event_type: "human.requested",
        data: { channel: "web" },
      });

      const systemText =
        "Certo. Você pediu atendimento humano. Quando alguém assumir, a conversa continua por aqui.";

      await admin.from("messages").insert({
        organization_id: session.organization_id,
        conversation_id: session.conversation_id,
        sender_type: "system",
        message_type: "text",
        body_text: systemText,
      });

      return response({
        ok: true,
        status: "waiting_human",
        message: systemText,
      });
    }

    return response({ ok: false, error: "unknown_action" }, 400);
  },
);

export default {
  fetch: async (req: Request) => {
    const headers = corsHeaders(req);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      const result = await coreHandler(req);
      const responseHeaders = new Headers(result.headers);
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === "string") responseHeaders.set(key, value);
      });

      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("chat-gateway-v1", error);
      return response(
        { ok: false, error: "internal_error" },
        500,
        headers,
      );
    }
  },
};
