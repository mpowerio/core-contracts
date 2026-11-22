-- ============================================================================
-- AI improvement consent ledger: REFERENCE DDL (core-contracts v0.6.0)
-- ============================================================================
--
-- This file is a reference, not a migration. Nothing runs it. Each system
-- copies it into its own migration folder and adds exactly ONE grant variant
-- from the bottom of the file. Applied as written, with no variant, it is
-- closed: no app role (anon, authenticated, service_role) can read a table,
-- write a table or run a function. Variants only ADD grants.
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
--   opt_in:   wording_version = AI_CONSENT_WORDING_VERSIONS[kind] and
--             wording_sha256  = wordingSha256(kind, lang)  (checked by the
--             server with validateAiConsentEvent() before the call)
--   withdraw: wording evidence is recorded when well-formed, stored as NULL
--             when not, and never blocks switching off.
--
-- Rules enforced here:
--   * Append-only. App roles get no INSERT, UPDATE, DELETE or TRUNCATE on
--     either table. A consent change goes through ai_consent_record()
--     (SECURITY DEFINER), which writes the event and, on a withdrawal, its
--     deletion request in the same transaction.
--   * Three functions write, each for one job: ai_consent_record() (events,
--     plus the deletion request on a withdrawal), ai_deletion_request_complete()
--     (pending -> completed, once) and ai_consent_retention_purge() (deletes
--     the ledger 3 years after the last withdrawal). Nothing else writes.
--   * UPDATE and TRUNCATE on events always raise. DELETE raises unless it runs
--     inside ai_consent_retention_purge(): that function is SECURITY DEFINER,
--     so its statements run as the table owner, and it sets a
--     transaction-local marker. The trigger checks both (effective user is
--     the table owner AND the marker is on). An app role that sets the marker
--     itself is still not the owner, and has no DELETE grant anyway.
--   * Concurrency. Every state-changing function first calls
--     ai_consent_lock(kind): it refuses to run unless the transaction is READ
--     COMMITTED, then takes pg_advisory_xact_lock on a stable per-kind key
--     (per tenant + kind in the substrate). Under READ COMMITTED each later
--     statement in the function reads a fresh snapshot, so the "already on /
--     already off / eligible for purge" decision sees every change committed
--     before the lock was granted. REPEATABLE READ and SERIALIZABLE are
--     refused because their snapshot is fixed at the transaction's first
--     statement, which can be before the lock; locking the latest row FOR
--     UPDATE would not help, because the conflicting change is a NEW row
--     (another opt-in or withdrawal), which a row lock cannot see.
--   * Opt-in only from Settings, only by an owner, only with the attestation
--     ticked. Staff never opt a business in; staff may record a withdrawal the
--     business asked for by email (source = 'email_request').
--   * Own-records training cannot be turned on yet (Chair ruling 3). Remove
--     that CHECK in a later migration together with a new wording version.
--   * Turning on when already on is refused. Turning off when already off is
--     not an error: it writes nothing and returns the earlier withdrawal's id
--     (or NULL if the business never opted in), so a retry is safe.
--   * A deletion request may only move from pending to completed, once,
--     through ai_deletion_request_complete(). MILA's exporter writes
--     'completed' (with a count) or 'completed_nothing_held' only after it has
--     examined the data set.
--   * ai_consent_window(kind) is the ONLY read the exporter uses. It returns
--     one row only while the business is opted in; after a withdrawal it
--     returns zero rows. No row means "do not use". An error or a missing
--     function must make the exporter stop loudly; it never means "not
--     opted in". ai_consent_windows_audit(kind) lists past windows for
--     people and audits; the exporter never calls it.
--   * Retention purge: service_role may call it (each system's scheduled job
--     runs as service_role). It uses the database clock (now()), deletes
--     only when every kind is off, no deletion request is pending, and the
--     last withdrawal is more than 3 years old.
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
  -- Required for opt_in; evidence only (nullable) for withdraw.
  wording_version     text CHECK (wording_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
  wording_sha256      text CHECK (wording_sha256 ~ '^[0-9a-f]{64}$'),
  lang                text CHECK (lang IN ('en', 'es')),
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
    action = 'withdraw'
    OR (source = 'settings' AND authority_attested IS TRUE
        AND wording_version IS NOT NULL AND wording_sha256 IS NOT NULL AND lang IS NOT NULL)
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
  CONSTRAINT ai_deletion_completed_after_requested CHECK (
    completed_at IS NULL OR completed_at >= requested_at
  ),
  CONSTRAINT ai_deletion_completion_fields CHECK (
    (status = 'pending' AND completed_at IS NULL AND deleted_rows IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND deleted_rows IS NOT NULL AND executor IS NOT NULL)
    OR (status = 'completed_nothing_held' AND completed_at IS NOT NULL AND deleted_rows = 0 AND executor IS NOT NULL)
  )
);

-- ── Guards ──────────────────────────────────────────────────────────────────

-- True only when the effective user is the table's owner AND the purge
-- marker is on for this transaction. Inside ai_consent_retention_purge()
-- (SECURITY DEFINER) both hold; an app role is never the owner.
CREATE FUNCTION public.ai_consent_purge_in_progress(p_rel oid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = p_rel)
     AND coalesce(current_setting('ai_consent.purge', true), '') = 'on';
$$;

CREATE FUNCTION public.ai_consent_block_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.ai_consent_purge_in_progress(TG_RELID) THEN
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

-- Deletion requests: created only for a withdrawal of the same kind; the only
-- allowed change is pending -> completed*, once, identifying columns fixed.
CREATE FUNCTION public.ai_deletion_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_consent_events ev
       WHERE ev.id = NEW.consent_event_id AND ev.action = 'withdraw' AND ev.kind = NEW.kind
    ) OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'a deletion request must point at a withdrawal of the same kind and start pending'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND public.ai_consent_purge_in_progress(TG_RELID) THEN
    RETURN OLD;
  END IF;
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
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
  BEFORE INSERT OR UPDATE OR DELETE ON public.ai_improvement_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.ai_deletion_request_guard();

CREATE TRIGGER ai_deletion_requests_no_truncate
  BEFORE TRUNCATE ON public.ai_improvement_deletion_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.ai_deletion_request_guard();

-- ── Serialize state changes ────────────────────────────────────────────────
-- Called first by every state-changing function. See "Concurrency" above.

CREATE FUNCTION public.ai_consent_lock(p_kind public.ai_consent_kind)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'ai_consent changes must run at READ COMMITTED (this transaction is %)',
                    upper(current_setting('transaction_isolation'))
      USING ERRCODE = 'invalid_transaction_state',
            HINT = 'Call this function in its own READ COMMITTED transaction (the default).';
  END IF;
  -- Two-key form: a fixed namespace for this ledger, then the kind.
  -- SUBSTRATE: hashtext(p_tenant::text || ':' || p_kind::text) as the second key.
  PERFORM pg_advisory_xact_lock(hashtext('mpowerio.ai_consent'), hashtext(p_kind::text));
END;
$$;

-- ── Record a change ────────────────────────────────────────────────────────
-- JBET/FPC: called by the server with service_role after it resolved the
-- actor from its own session. SUBSTRATE: rewrite it to read auth.uid(),
-- check current_tenant_id() = p_tenant, current_role_in_tenant() = 'owner'
-- and NOT current_is_root(), and fill actor_* itself instead of taking them
-- as arguments. This single-business version TRUSTS its actor arguments, so
-- it must never be executable by `authenticated`.

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
  v_last_action public.ai_consent_action;
  v_last_id     uuid;
  v_version     text := p_wording_version;
  v_sha         text := p_wording_sha256;
  v_lang        text := p_lang;
  v_event       uuid;
BEGIN
  -- One change per kind at a time, and the reads below see fresh state.
  PERFORM public.ai_consent_lock(p_kind);

  SELECT action, id INTO v_last_action, v_last_id
    FROM public.ai_consent_events
   WHERE kind = p_kind
   ORDER BY occurred_at DESC, id DESC
   LIMIT 1;

  IF p_action = 'opt_in' AND v_last_action = 'opt_in' THEN
    RAISE EXCEPTION 'already on' USING ERRCODE = 'check_violation';
  END IF;

  IF p_action = 'withdraw' THEN
    IF v_last_action IS DISTINCT FROM 'opt_in' THEN
      -- Already off (or never on): nothing to do, and not an error.
      RETURN CASE WHEN v_last_action = 'withdraw' THEN v_last_id END;
    END IF;
    -- Wording is evidence for a withdrawal, never a condition. Keep it only
    -- when well-formed; store NULL otherwise.
    IF v_version IS NULL OR v_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$' THEN v_version := NULL; END IF;
    IF v_sha IS NULL OR v_sha !~ '^[0-9a-f]{64}$' THEN v_sha := NULL; END IF;
    IF v_lang IS NULL OR v_lang NOT IN ('en', 'es') THEN v_lang := NULL; END IF;
  END IF;

  INSERT INTO public.ai_consent_events (
    kind, action, source, actor_user_id, actor_name, actor_email, actor_role,
    authority_attested, wording_version, wording_sha256, lang,
    recorded_by_user_id, request_ref
  ) VALUES (
    p_kind, p_action, p_source, p_actor_user_id, p_actor_name, p_actor_email, p_actor_role,
    coalesce(p_authority_attested, false), v_version, v_sha, v_lang,
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

-- ── Complete a deletion request (the exporter's only write) ────────────────

CREATE FUNCTION public.ai_deletion_request_complete(
  p_request_id   uuid,
  p_status       text,
  p_deleted_rows bigint,
  p_executor     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind public.ai_consent_kind;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed', 'completed_nothing_held') THEN
    RAISE EXCEPTION 'status must be completed or completed_nothing_held' USING ERRCODE = 'check_violation';
  END IF;
  -- kind never changes, so it is safe to read before the lock.
  SELECT kind INTO v_kind FROM public.ai_improvement_deletion_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no deletion request %', p_request_id USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.ai_consent_lock(v_kind);

  -- clock_timestamp(), not now(): a request created and completed in one
  -- transaction must still show completed_at >= requested_at.
  UPDATE public.ai_improvement_deletion_requests
     SET status = p_status,
         completed_at = greatest(clock_timestamp(), requested_at),
         deleted_rows = p_deleted_rows,
         executor = p_executor
   WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deletion request % is not pending', p_request_id USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- ── Training gate: the exporter's only read ────────────────────────────────
-- One row while the business is opted in to this kind: the time of the
-- latest opt-in. Zero rows if it never opted in OR its latest event is a
-- withdrawal. Use only activity at or after opted_in_at.

CREATE FUNCTION public.ai_consent_window(p_kind public.ai_consent_kind)
RETURNS TABLE (opted_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT latest.occurred_at
    FROM (
      SELECT action, occurred_at
        FROM public.ai_consent_events
       WHERE kind = p_kind
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1
    ) latest
   WHERE latest.action = 'opt_in';
$$;

-- ── Audit read: every window, open or closed. NOT for the exporter. ────────

CREATE FUNCTION public.ai_consent_windows_audit(p_kind public.ai_consent_kind)
RETURNS TABLE (opted_in_at timestamptz, withdrawn_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT o.occurred_at,
         (SELECT min(w.occurred_at)
            FROM public.ai_consent_events w
           WHERE w.kind = p_kind AND w.action = 'withdraw'
             AND (w.occurred_at, w.id) > (o.occurred_at, o.id))
    FROM public.ai_consent_events o
   WHERE o.kind = p_kind AND o.action = 'opt_in'
   ORDER BY o.occurred_at;
$$;

-- ── Retention purge: 3 years after the last withdrawal ─────────────────────
-- Deletes the whole ledger only when every kind is off (last event is a
-- withdrawal, or there are no events), no deletion request is pending, and
-- the last withdrawal is more than 3 years old by the database clock.
-- Returns the number of events deleted. service_role may call it; it takes
-- every kind's lock (in enum order) before deciding.

CREATE FUNCTION public.ai_consent_retention_purge()
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
  -- Every kind, in a fixed order (the record function takes only one, so no
  -- deadlock). The reads below then see every committed change.
  PERFORM public.ai_consent_lock('service_improvement');
  PERFORM public.ai_consent_lock('own_records_training');

  SELECT coalesce(bool_or(last_action = 'opt_in'), false) INTO v_any_on
    FROM (
      SELECT DISTINCT ON (kind) kind, action AS last_action
        FROM public.ai_consent_events
       ORDER BY kind, occurred_at DESC, id DESC
    ) latest;
  SELECT EXISTS (SELECT 1 FROM public.ai_improvement_deletion_requests WHERE status = 'pending')
    INTO v_pending;
  SELECT max(occurred_at) INTO v_last_withdraw
    FROM public.ai_consent_events WHERE action = 'withdraw';

  IF v_any_on OR v_pending OR v_last_withdraw IS NULL
     OR v_last_withdraw > now() - interval '3 years' THEN
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

-- ── RLS: on everywhere. No policies for writes: there are no write grants. ──

ALTER TABLE public.ai_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_improvement_deletion_requests ENABLE ROW LEVEL SECURITY;
-- SUBSTRATE ONLY:
-- CREATE POLICY ai_consent_events_select ON public.ai_consent_events FOR SELECT
--   USING (tenant_id = public.current_tenant_id() OR public.current_is_root());
-- CREATE POLICY ai_deletion_requests_select ON public.ai_improvement_deletion_requests FOR SELECT
--   USING (tenant_id = public.current_tenant_id() OR public.current_is_root());

-- ── Rule 18, part 1 (always applied): close everything ─────────────────────
-- Postgres gives EXECUTE on new functions and USAGE on new types to PUBLIC,
-- and Supabase's default privileges give app roles full table access. Remove
-- all of it here, so the file is safe even if no variant is added.

REVOKE ALL ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TYPE public.ai_consent_kind, public.ai_consent_action
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
  public.ai_deletion_request_complete(uuid, text, bigint, text),
  public.ai_consent_window(public.ai_consent_kind),
  public.ai_consent_windows_audit(public.ai_consent_kind),
  public.ai_consent_retention_purge(),
  public.ai_consent_purge_in_progress(oid),
  public.ai_consent_lock(public.ai_consent_kind),
  public.ai_consent_block_change(),
  public.ai_deletion_request_guard()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── Rule 18, part 2: ADD EXACTLY ONE VARIANT (grants only) ─────────────────
-- No variant grants INSERT, UPDATE, DELETE or TRUNCATE on either table to any
-- app role: writes go only through the three functions. Every variant lets
-- service_role run the purge, because each system's scheduled retention job
-- runs as service_role.

-- >>> VARIANT substrate (Supabase Auth. authenticated reads its own business's
-- rows through RLS. The server writes with service_role. Grant EXECUTE on the
-- record function to authenticated ONLY after it is rewritten to resolve the
-- actor and tenant from the session; until then it stays service_role only.)
-- GRANT SELECT ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   TO authenticated, service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_deletion_request_complete(uuid, text, bigint, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_windows_audit(public.ai_consent_kind),
--   public.ai_consent_retention_purge()
--   TO service_role;
-- <<< END VARIANT substrate

-- >>> VARIANT jbet (NextAuth, no Supabase JWTs: service_role only. JBET's
-- grant lint fails any authenticated grant.)
-- GRANT SELECT ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   TO service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO service_role;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_deletion_request_complete(uuid, text, bigint, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_windows_audit(public.ai_consent_kind),
--   public.ai_consent_retention_purge()
--   TO service_role;
-- <<< END VARIANT jbet

-- >>> VARIANT fpc (Supabase Auth; server actions write with service_role.
-- authenticated gets an inert SELECT because FPC's grant linter requires it;
-- with RLS on and no policies it returns zero rows.)
-- GRANT SELECT ON TABLE public.ai_consent_events, public.ai_improvement_deletion_requests
--   TO authenticated, service_role;
-- GRANT USAGE ON TYPE public.ai_consent_kind, public.ai_consent_action TO authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION
--   public.ai_consent_record(public.ai_consent_kind, public.ai_consent_action, text, text, text, text, text, boolean, text, text, text, text, text),
--   public.ai_deletion_request_complete(uuid, text, bigint, text),
--   public.ai_consent_window(public.ai_consent_kind),
--   public.ai_consent_windows_audit(public.ai_consent_kind),
--   public.ai_consent_retention_purge()
--   TO service_role;
-- <<< END VARIANT fpc

COMMIT;
