-- ============================================================================
-- AI improvement consent ledger: REFERENCE DDL (core-contracts v0.6.0)
-- ============================================================================
--
-- This file is a reference, not a migration. Nothing runs it. Each system
-- copies it into its own migration folder, keeps exactly ONE grant variant
-- from the bottom of the file, and adapts names to its own conventions.
--
-- Shape: the single-business form (one database = one business), used by
-- JBET and FPC. The substrate hosts several businesses in one database, so
-- its copy adds `tenant_id uuid NOT NULL REFERENCES public.tenants(id)` to
-- both tables, scopes every lock, lookup and purge by tenant, adds a
-- `p_tenant` argument to each function, resolves the actor inside the record
-- function from its own session (never from arguments), and adds RLS SELECT
-- policies `USING (tenant_id = public.current_tenant_id() OR
-- public.current_is_root())`. Those lines are marked "SUBSTRATE:" below.
--
-- Contract it must match (src/consent/ai-improvement.ts):
--   kind   in ('service_improvement', 'own_records_training')
--   action in ('opt_in', 'withdraw')
--   lang   in ('en', 'es')
--   source in ('settings', 'email_request')
--   wording_version  = AI_CONSENT_WORDING_VERSIONS[kind] at the time of the event
--   wording_sha256   = wordingSha256(kind, lang)   (lowercase hex, 64 chars)
-- The server action must run validateAiConsentEvent() before calling
-- ai_consent_record(); the database repeats the rules it can check alone.
--
-- Rules enforced here:
--   * Append-only. UPDATE, DELETE and TRUNCATE on events raise. The only
--     exception is ai_consent_retention_purge(), 3 years after the last
--     withdrawal (the policy's retention promise).
--   * Opt-in only from Settings, only by an owner, only with the attestation
--     ticked. Staff never opt a business in; staff may record a withdrawal the
--     business asked for by email (source = 'email_request').
--   * Own-records training cannot be turned on yet (Chair ruling 3). Remove
--     that CHECK in a later migration together with a new wording version.
--   * The same state twice is refused (on -> on, off -> off).
--   * A withdrawal creates exactly one deletion request in the same
--     transaction. MILA's exporter pulls it, deletes the data it holds, and
--     writes back 'completed' (with a count) or 'completed_nothing_held' only
--     after it has examined the data set.
--   * ai_consent_window(kind) is the ONLY read the exporter uses. No row means
--     "never opted in". An error or a missing function must make the exporter
--     stop loudly; it never means "not opted in".
--
-- Ledger rows hold the agreeing person's name, email and role only. Never
-- message text, never customer data.
-- ============================================================================

BEGIN;

CREATE TYPE public.ai_consent_kind AS ENUM ('service_improvement', 'own_records_training');
CREATE TYPE public.ai_consent_action AS ENUM ('opt_in', 'withdraw');

CREATE TABLE public.ai_consent_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SUBSTRATE: tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind                public.ai_consent_kind   NOT NULL,
  action              public.ai_consent_action NOT NULL,
  source              text NOT NULL CHECK (source IN ('settings', 'email_request')),
  -- The signed-in user. text, not uuid, so NextAuth ids fit; use uuid where
  -- the auth system's ids are uuids. NULL only for an emailed withdrawal.
  actor_user_id       text,
  actor_name          text NOT NULL CHECK (btrim(actor_name)  <> ''),
  actor_email         text NOT NULL CHECK (btrim(actor_email) <> ''),
  -- Resolved by the system from its own session or membership table.
  actor_role          text NOT NULL CHECK (btrim(actor_role)  <> ''),
  authority_attested  boolean NOT NULL,
  wording_version     text NOT NULL CHECK (wording_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
  wording_sha256      text NOT NULL CHECK (wording_sha256 ~ '^[0-9a-f]{64}$'),
  lang                text NOT NULL CHECK (lang IN ('en', 'es')),
  -- Staff member who entered an emailed withdrawal.
  recorded_by_user_id text,
  -- e.g. a mail message id. Never message text.
  request_ref         text,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT ai_consent_settings_rows_are_owner CHECK (
    source <> 'settings' OR (actor_user_id IS NOT NULL AND actor_role = 'owner')
  ),
  CONSTRAINT ai_consent_email_rows_have_recorder CHECK (
    source <> 'email_request' OR recorded_by_user_id IS NOT NULL
  ),
  CONSTRAINT ai_consent_opt_in_rules CHECK (
    action = 'withdraw' OR (source = 'settings' AND authority_attested)
  ),
  CONSTRAINT ai_consent_own_records_not_offered CHECK (
    NOT (kind = 'own_records_training' AND action = 'opt_in')
  )
);

CREATE INDEX ai_consent_events_kind_time_idx
  ON public.ai_consent_events (kind, occurred_at DESC, id DESC);

CREATE TABLE public.ai_improvement_deletion_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SUBSTRATE: tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  consent_event_id uuid NOT NULL UNIQUE REFERENCES public.ai_consent_events(id),
  kind             public.ai_consent_kind NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'completed_nothing_held')),
  completed_at     timestamptz,
  deleted_rows     bigint CHECK (deleted_rows IS NULL OR deleted_rows >= 0),
  executor         text,
  CONSTRAINT ai_deletion_completion_fields CHECK (
    (status = 'pending' AND completed_at IS NULL AND deleted_rows IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND deleted_rows IS NOT NULL AND executor IS NOT NULL)
    OR (status = 'completed_nothing_held' AND completed_at IS NOT NULL AND deleted_rows = 0 AND executor IS NOT NULL)
  )
);

-- ── Append-only guards ──────────────────────────────────────────────────────

CREATE FUNCTION public.ai_consent_block_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Set only inside ai_consent_retention_purge(), transaction-local.
  IF current_setting('ai_consent.purge', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ai_consent_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER ai_consent_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.ai_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.ai_consent_block_change();

CREATE TRIGGER ai_consent_events_no_truncate
  BEFORE TRUNCATE ON public.ai_consent_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.ai_consent_block_change();

-- Deletion requests: the only allowed change is pending -> completed*, once,
-- with the identifying columns unchanged.
CREATE FUNCTION public.ai_deletion_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    IF TG_OP = 'DELETE' AND current_setting('ai_consent.purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ai_improvement_deletion_requests rows cannot be deleted (% refused)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'pending'
     OR NEW.status = 'pending'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.consent_event_id IS DISTINCT FROM OLD.consent_event_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
    RAISE EXCEPTION 'a deletion request may only move from pending to completed, once'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_deletion_requests_guard
  BEFORE UPDATE OR DELETE ON public.ai_improvement_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.ai_deletion_request_guard();

CREATE TRIGGER ai_deletion_requests_no_truncate
  BEFORE TRUNCATE ON public.ai_improvement_deletion_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.ai_deletion_request_guard();

-- ── Record a change (the only write path) ──────────────────────────────────
-- JBET/FPC: called by the server with service_role after it resolved the
-- actor from its own session. SUBSTRATE: called by `authenticated`; the
-- function reads auth.uid(), checks current_tenant_id() = p_tenant,
-- current_role_in_tenant() = 'owner' and NOT current_is_root(), and fills
-- actor_* itself instead of taking them as arguments.

CREATE FUNCTION public.ai_consent_record(
  p_kind                public.ai_consent_kind,
  p_action              public.ai_consent_action,
  p_source              text,
  p_actor_user_id       text,
  p_actor_name          text,
  p_actor_email         text,
  p_actor_role          text,
  p_authority_attested  boolean,
  p_wording_version     text,
  p_wording_sha256      text,
  p_lang                text,
  p_recorded_by_user_id text DEFAULT NULL,
  p_request_ref         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_last  public.ai_consent_action;
  v_event uuid;
BEGIN
  -- One change per kind at a time, so "already on" is decided correctly.
  PERFORM pg_advisory_xact_lock(hashtext('ai_consent:' || p_kind::text));

  SELECT action INTO v_last
    FROM public.ai_consent_events
   WHERE kind = p_kind
   ORDER BY occurred_at DESC, id DESC
   LIMIT 1;

  IF p_action = 'opt_in' AND v_last = 'opt_in' THEN
    RAISE EXCEPTION 'already on' USING ERRCODE = 'check_violation';
  END IF;
  IF p_action = 'withdraw' AND v_last IS DISTINCT FROM 'opt_in' THEN
    RAISE EXCEPTION 'already off' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.ai_consent_events (
    kind, action, source, actor_user_id, actor_name, actor_email, actor_role,
    authority_attested, wording_version, wording_sha256, lang,
    recorded_by_user_id, request_ref
  ) VALUES (
    p_kind, p_action, p_source, p_actor_user_id, p_actor_name, p_actor_email, p_actor_role,
    p_authority_attested, p_wording_version, p_wording_sha256, p_lang,
    p_recorded_by_user_id, p_request_ref
  )
  RETURNING id INTO v_event;

  IF p_action = 'withdraw' THEN
    INSERT INTO public.ai_improvement_deletion_requests (consent_event_id, kind)
    VALUES (v_event, p_kind);
  END IF;

  RETURN v_event;
END;
$$;

-- ── Training gate: the exporter's only read ────────────────────────────────
-- Returns the current window, or the most recent closed one. Zero rows means
-- the business never opted in to this kind. Use activity only at or after
-- opted_in_at and, when withdrawn_at is set, before withdrawn_at.

CREATE FUNCTION public.ai_consent_window(p_kind public.ai_consent_kind)
RETURNS TABLE (opted_in_at timestamptz, withdrawn_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH last_in AS (
    SELECT occurred_at, id
      FROM public.ai_consent_events
     WHERE kind = p_kind AND action = 'opt_in'
     ORDER BY occurred_at DESC, id DESC
     LIMIT 1
  )
  SELECT li.occurred_at,
         (SELECT min(w.occurred_at)
            FROM public.ai_consent_events w
           WHERE w.kind = p_kind AND w.action = 'withdraw'
             AND (w.occurred_at, w.id) > (li.occurred_at, li.id))
    FROM last_in li;
$$;

-- ── Retention purge: 3 years after the last withdrawal ─────────────────────
-- Deletes the whole ledger only when every kind is off (last event is a
-- withdrawal, or there are no events), no deletion request is pending, and
-- the last withdrawal is older than 3 years. Returns the events deleted.
-- p_now exists so tests can drive the clock.

CREATE FUNCTION public.ai_consent_retention_purge(p_now timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_any_on        boolean;
  v_pending       boolean;
  v_last_withdraw timestamptz;
  v_deleted       bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai_consent:service_improvement'));
  PERFORM pg_advisory_xact_lock(hashtext('ai_consent:own_records_training'));

  SELECT bool_or(last_action = 'opt_in') INTO v_any_on
    FROM (
      SELECT DISTINCT ON (kind) kind, action AS last_action
        FROM public.ai_consent_events
       ORDER BY kind, occurred_at DESC, id DESC
    ) latest;
  SELECT EXISTS (SELECT 1 FROM public.ai_improvement_deletion_requests WHERE status = 'pending')
    INTO v_pending;
  SELECT max(occurred_at) INTO v_last_withdraw
    FROM public.ai_consent_events WHERE action = 'withdraw';

  IF coalesce(v_any_on, false) OR v_pending OR v_last_withdraw IS NULL
     OR v_last_withdraw > p_now - interval '3 years' THEN
    RETURN 0;
  END IF;

  PERFORM set_config('ai_consent.purge', 'on', true);
  DELETE FROM public.ai_improvement_deletion_requests;
  DELETE FROM public.ai_consent_events;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('ai_consent.purge', 'off', true);
  RETURN v_deleted;
END;
$$;

-- ── RLS: on everywhere. No write policies: writes go through the function. ──

ALTER TABLE public.ai_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_improvement_deletion_requests ENABLE ROW LEVEL SECURITY;
-- SUBSTRATE ONLY:
-- CREATE POLICY ai_consent_events_select ON public.ai_consent_events FOR SELECT
--   USING (tenant_id = public.current_tenant_id() OR public.current_is_root());
-- CREATE POLICY ai_deletion_requests_select ON public.ai_improvement_deletion_requests FOR SELECT
--   USING (tenant_id = public.current_tenant_id() OR public.current_is_root());

-- ── Rule-18 grants: KEEP EXACTLY ONE VARIANT ───────────────────────────────
-- Grants are additive and Postgres gives EXECUTE on new functions to PUBLIC,
-- so every variant revokes from PUBLIC, anon and authenticated first.
-- TRUNCATE is never granted to anon or authenticated.

-- >>> VARIANT substrate (Supabase Auth; authenticated reads its own rows via
-- RLS and writes ONLY through ai_consent_record, never table writes, so the
-- append-only rule cannot be bypassed through the Data API. This is narrower
-- than the canonical full-CRUD grant on purpose. Grant EXECUTE on the record
-- function to authenticated ONLY after it is rewritten to resolve the actor
-- from the session; the single-business version above trusts its arguments.)
-- REVOKE ALL ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   FROM PUBLIC, anon, authenticated;
-- GRANT SELECT ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_consent_events,
--   public.ai_improvement_deletion_requests TO service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO authenticated, service_role;
-- REVOKE ALL ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_retention_purge(timestamptz),
--   public.ai_consent_block_change(),
--   public.ai_deletion_request_guard()
--   FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text)
--   TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.ai_consent_window(public.ai_consent_kind) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.ai_consent_retention_purge(timestamptz) TO service_role;
-- <<< END VARIANT substrate

-- >>> VARIANT jbet (NextAuth, no Supabase JWTs: service_role only. JBET's
-- grant lint fails any authenticated grant.)
-- REVOKE ALL ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   FROM PUBLIC, anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_consent_events,
--   public.ai_improvement_deletion_requests TO service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO service_role;
-- REVOKE ALL ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_retention_purge(timestamptz),
--   public.ai_consent_block_change(),
--   public.ai_deletion_request_guard()
--   FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_retention_purge(timestamptz)
--   TO service_role;
-- <<< END VARIANT jbet

-- >>> VARIANT fpc (Supabase Auth, server actions write with service_role.
-- authenticated gets an inert SELECT because FPC's grant linter requires it;
-- with RLS on and no policies it returns zero rows.)
-- REVOKE ALL ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   FROM PUBLIC, anon, authenticated;
-- GRANT SELECT ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_consent_events,
--   public.ai_improvement_deletion_requests TO service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO authenticated, service_role;
-- REVOKE ALL ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_retention_purge(timestamptz),
--   public.ai_consent_block_change(),
--   public.ai_deletion_request_guard()
--   FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_retention_purge(timestamptz)
--   TO service_role;
-- <<< END VARIANT fpc

COMMIT;
