-- Minimal Fider data (real Fider schema, created by getfider/fider:stable) for the importer test.
INSERT INTO tenants (id, name, subdomain, created_at, status, is_private, custom_css, logo_bkey, locale, is_email_auth_allowed, is_feed_enabled, prevent_indexing, is_moderation_enabled, is_pro)
VALUES (1, 'Billiwo', 'feedback', now(), 1, false, '', '', 'sk', true, true, false, false, false);
INSERT INTO users (id, name, email, created_at, tenant_id, role, status, avatar_type, avatar_bkey, is_trusted) VALUES
 (1, 'Peter Admin', 'peter@billiwo.test', now(), 1, 3, 1, 2, '', true),
 (2, 'Mária Zákazníčka', 'maria@firma.test', now(), 1, 1, 1, 2, '', false),
 (3, 'Ján Bez SSO', 'jan@firma.test', now(), 1, 1, 1, 2, '', false),
 (4, 'Zmazaný', 'x@x.test', now(), 1, 1, 2, 2, '', false);
INSERT INTO user_providers (user_id, provider, provider_uid, created_at, tenant_id) VALUES
 (1, '_billiwo', 'bw-user-1', now(), 1), (2, '_billiwo', 'bw-user-2', now(), 1);
INSERT INTO tags (id, tenant_id, name, slug, color, is_public, created_at) VALUES (1, 1, 'Bug', 'bug', 'FF0000', true, now());
INSERT INTO posts (id, title, description, tenant_id, created_at, user_id, number, status, slug, response, response_user_id, response_date, original_id, is_approved) VALUES
 (1, 'Export do Pohody', 'Potrebujeme XML export.', 1, now() - interval '30 days', 2, 1, 4, 'export-do-pohody', 'Plánujeme v Q1.', 1, now() - interval '5 days', NULL, true),
 (2, 'Pohoda export prosím', 'To isté', 1, now() - interval '20 days', 3, 2, 5, 'pohoda-export', NULL, NULL, NULL, 1, true),
 (3, 'PDF bez diakritiky', 'Adresa nemá mäkčene.', 1, now() - interval '10 days', 2, 3, 2, 'pdf-bez-diakritiky', 'Opravené.', 1, now() - interval '2 days', NULL, true),
 (4, 'Spam', 'spam', 1, now(), 3, 4, 6, 'spam', NULL, NULL, NULL, NULL, true);
INSERT INTO post_tags (tag_id, post_id, created_at, created_by_id, tenant_id) VALUES (1, 3, now(), 1, 1);
INSERT INTO post_votes (user_id, post_id, created_at, tenant_id) VALUES (2, 1, now(), 1), (3, 1, now(), 1), (1, 1, now(), 1), (3, 2, now(), 1), (2, 3, now(), 1);
INSERT INTO comments (id, content, post_id, user_id, created_at, tenant_id, is_approved) VALUES
 (1, 'Aj my by sme to chceli.', 1, 3, now() - interval '25 days', 1, true),
 (2, 'Toto je zmazané', 1, 3, now(), 1, true);
UPDATE comments SET deleted_at = now(), deleted_by_id = 1 WHERE id = 2;
INSERT INTO blobs (id, key, tenant_id, size, content_type, file, created_at, modified_at) VALUES
 (1, 'attachments/abc-screen.png', 1, 8, 'image/png', decode('89504e470d0a1a0a', 'hex'), now(), now());
INSERT INTO attachments (id, tenant_id, post_id, comment_id, user_id, attachment_bkey) VALUES (1, 1, 3, NULL, 2, 'attachments/abc-screen.png');
