-- Remove redundant returning-token mechanism.
-- Returning web customers are recognized through customer_identities(kind='web_session')
-- + visitor_hash, which is already part of chat-gateway-v1.
drop table if exists returning_customer_tokens;
