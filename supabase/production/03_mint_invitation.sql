-- 03_mint_invitation.sql — create a shared invitation code students redeem to enroll.
-- The plaintext code is NEVER stored (only its sha256 hash + a short prefix). You
-- provide the plaintext so you can distribute it; it cannot be recovered later.
-- Idempotent on the code hash.
--   psql "$PROD_DATABASE_URL" -v school_id='...' -v code='SWAP-PILOT-2026' -v max_uses=500 -f 03_mint_invitation.sql
\set ON_ERROR_STOP on

\if :{?school_id}
\else
  \echo 'ERROR: pass -v school_id=''...'''
  \quit
\endif
\if :{?code}
\else
  \echo 'ERROR: pass -v code=''...'' (the plaintext students will type; store it safely)'
  \quit
\endif
\if :{?max_uses}
\else
  \set max_uses 500
\endif

-- 'shared' = one code many students may redeem (up to max_uses); 'single_use' would
-- be one-per-student. We mint a shared pilot code with no approval and no expiry.
insert into invitations (school_id, code_prefix, code_hash, type, max_uses, requires_approval, expires_at)
values (:'school_id', left(:'code', 9), app.hash_code(:'code'), 'shared', :max_uses, false, null)
on conflict (code_hash) do nothing;

\echo '---------------------------------------------------------------'
\echo 'Invitation ready. Distribute this code to students:'
\echo :'code'
\echo '(The plaintext is not stored — keep it somewhere safe.)'
\echo '---------------------------------------------------------------'
