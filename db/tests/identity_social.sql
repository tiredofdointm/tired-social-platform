-- Run only against a disposable test database. All fixtures roll back.
BEGIN;
DO $$
DECLARE
 a uuid; b uuid; c uuid; pub uuid; priv uuid; followers_post uuid; n integer;
BEGIN
 INSERT INTO users(identity_issuer,identity_subject) VALUES('test-only','alice') RETURNING id INTO a;
 INSERT INTO users(identity_issuer,identity_subject) VALUES('test-only','bob') RETURNING id INTO b;
 INSERT INTO users(identity_issuer,identity_subject) VALUES('test-only','carol') RETURNING id INTO c;
 INSERT INTO profiles(user_id,handle,display_name) VALUES(a,'alice_test','Alice'),(b,'bob_test','Bob');
 BEGIN
  INSERT INTO profiles(user_id,handle,display_name) VALUES(c,'alice_test','Carol');
  RAISE EXCEPTION 'duplicate handle unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO follows(follower_id,followed_id) VALUES(a,a);
  RAISE EXCEPTION 'self follow unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO posts(author_id,body) VALUES(a,'   ');
  RAISE EXCEPTION 'empty post unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO posts(author_id,body,visibility) VALUES(a,'Public test','public') RETURNING id INTO pub;
 INSERT INTO posts(author_id,body,visibility) VALUES(a,'Private test','private') RETURNING id INTO priv;
 INSERT INTO posts(author_id,body,visibility) VALUES(a,'Followers test','followers') RETURNING id INTO followers_post;
 IF NOT can_view_post(NULL,pub) THEN RAISE EXCEPTION 'public post hidden from anonymous viewer'; END IF;
 IF can_view_post(b,priv) OR can_view_post(NULL,priv) THEN RAISE EXCEPTION 'private post leaked'; END IF;
 IF NOT can_view_post(a,priv) THEN RAISE EXCEPTION 'owner cannot view own private post'; END IF;
 IF can_view_post(b,followers_post) THEN RAISE EXCEPTION 'nonfollower saw followers post'; END IF;
 INSERT INTO follows(follower_id,followed_id) VALUES(b,a);
 IF can_view_post(b,followers_post) THEN RAISE EXCEPTION 'pending follow received access'; END IF;
 UPDATE follows SET status='accepted' WHERE follower_id=b AND followed_id=a;
 IF NOT can_view_post(b,followers_post) THEN RAISE EXCEPTION 'accepted follow denied'; END IF;
 INSERT INTO blocks(blocker_id,blocked_id) VALUES(a,b);
 IF can_view_post(b,pub) OR can_view_post(b,followers_post) THEN RAISE EXCEPTION 'blocked viewer received access'; END IF;
 DELETE FROM blocks WHERE blocker_id=a AND blocked_id=b;
 INSERT INTO blocks(blocker_id,blocked_id) VALUES(b,a);
 IF can_view_post(b,pub) THEN RAISE EXCEPTION 'reverse block ignored'; END IF;
 DELETE FROM blocks WHERE blocker_id=b AND blocked_id=a;
 UPDATE users SET status='suspended' WHERE id=b;
 IF can_view_post(b,pub) THEN RAISE EXCEPTION 'suspended viewer allowed'; END IF;
 UPDATE users SET status='active' WHERE id=b;
 UPDATE posts SET moderation_state='hidden' WHERE id=pub;
 IF can_view_post(a,pub) OR can_view_post(b,pub) THEN RAISE EXCEPTION 'hidden post leaked'; END IF;
 UPDATE posts SET moderation_state='visible',deleted_at=now() WHERE id=pub;
 IF can_view_post(NULL,pub) THEN RAISE EXCEPTION 'deleted post leaked'; END IF;
 INSERT INTO reactions(user_id,post_id) VALUES(b,priv) ON CONFLICT DO NOTHING;
 INSERT INTO reactions(user_id,post_id) VALUES(b,priv) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO n FROM reactions WHERE user_id=b AND post_id=priv;
 IF n<>1 THEN RAISE EXCEPTION 'reaction duplicated'; END IF;
 -- This fixture intentionally inserts against a private post to document that
 -- table constraints are not API permission checks. The API must enforce can_view_post.
 BEGIN
  INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(a,decode(repeat('ab',32),'hex'),now()-interval '1 day');
  RAISE EXCEPTION 'invalid session lifetime accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'PASS: uniqueness, validation, visibility, accepted follows, two-way blocks, suspension, moderation, deletion, reaction idempotency and session lifetime';
END;
$$;
ROLLBACK;
