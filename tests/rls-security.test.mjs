import assert from "node:assert/strict";

const requiredEnvironment = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD"
];

const missingEnvironment =
  requiredEnvironment.filter(name => !process.env[name]);

if (missingEnvironment.length) {
  console.error(
    `Missing environment variables: ${missingEnvironment.join(", ")}`
  );
  process.exit(1);
}

const baseUrl =
  process.env.SUPABASE_URL.replace(/\/+$/, "");

const anonKey =
  process.env.SUPABASE_ANON_KEY;

const runId =
  `rls-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function signIn(email, password) {
  const response =
    await fetch(
      `${baseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    );

  const body =
    await response.json();

  assert.equal(
    response.ok,
    true,
    `Login failed for ${email}: ${JSON.stringify(body)}`
  );

  return {
    token: body.access_token,
    user: body.user
  };
}

function restHeaders(token, prefer = "") {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function restRequest(
  path,
  {
    token = null,
    method = "GET",
    body,
    prefer = ""
  } = {}
) {
  const response =
    await fetch(
      `${baseUrl}/rest/v1/${path}`,
      {
        method,
        headers: restHeaders(token, prefer),
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body)
      }
    );

  const text =
    await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    response,
    data
  };
}

async function serviceRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(serviceKey, "Service-role key is required for this request.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

const results = [];

async function test(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.message
    });
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

const userA =
  await signIn(
    process.env.TEST_USER_A_EMAIL,
    process.env.TEST_USER_A_PASSWORD
  );

const userB =
  await signIn(
    process.env.TEST_USER_B_EMAIL,
    process.env.TEST_USER_B_PASSWORD
  );

const admin =
  await signIn(
    process.env.TEST_ADMIN_EMAIL,
    process.env.TEST_ADMIN_PASSWORD
  );

assert.notEqual(userA.user.id, userB.user.id);
assert.notEqual(userA.user.id, admin.user.id);

const favoriteEventId =
  `[RLS TEST] favorite ${runId}`;

const seasonEventId =
  `[RLS TEST] season ${runId}`;

let submittedEventId = null;
let publicFixtureEventId = null;

const publicFixtureInsert =
  await restRequest(
    "events",
    {
      token: admin.token,
      method: "POST",
      prefer: "return=representation",
      body: {
        event_name: `[RLS TEST] public ${runId}`,
        sport: "Running",
        date: "30.12.2027",
        city: "Berlin",
        country: "Germany",
        address: "Test venue",
        latitude: 52.52,
        longitude: 13.405,
        distance: "5 km",
        event_url: "https://example.com/rls-public-test",
        status: "pending",
        created_by: admin.user.id
      }
    }
  );

assert.equal(publicFixtureInsert.response.ok, true, JSON.stringify(publicFixtureInsert.data));
publicFixtureEventId = publicFixtureInsert.data[0].id;

const publicFixtureApproval =
  await restRequest(
    `events?id=eq.${encodeURIComponent(publicFixtureEventId)}`,
    {
      token: admin.token,
      method: "PATCH",
      prefer: "return=representation",
      body: {
        status: "approved"
      }
    }
  );

assert.equal(publicFixtureApproval.response.ok, true);

await test(
  "1. Anonymous users can read approved events",
  async () => {
    const { response, data } =
      await restRequest(
        `events?select=id,status&id=eq.${encodeURIComponent(publicFixtureEventId)}`
      );

    assert.equal(response.ok, true);
    assert.equal(Array.isArray(data), true);
    assert.equal(data.length, 1);
    assert.equal(data[0].status, "approved");
  }
);

await test(
  "1b. Public archive is readable while lifecycle exceptions stay private",
  async () => {
    const archive = await restRequest("public_event_archive?select=event_id,edition_id,discovery_status,results&limit=5");
    assert.equal(archive.response.ok, true, JSON.stringify(archive.data));

    const anonymousInbox = await restRequest("admin_review_inbox?select=item_id&limit=1");
    assert.equal(
      anonymousInbox.response.status === 401 ||
      anonymousInbox.response.status === 403 ||
      (anonymousInbox.response.ok && Array.isArray(anonymousInbox.data) && anonymousInbox.data.length === 0),
      true,
      JSON.stringify(anonymousInbox.data)
    );
  }
);

await test(
  "1c. Normal users cannot create result records or read the exception inbox",
  async () => {
    const resultInsert = await restRequest("edition_results", {
      token: userA.token,
      method: "POST",
      prefer: "return=representation",
      body: {
        event_id: publicFixtureEventId,
        edition_id: "00000000-0000-0000-0000-000000000000",
        result_type: "official_results",
        official_url: "https://example.com/results",
        fingerprint: `rls-result-${runId}`
      }
    });
    assert.equal(resultInsert.response.ok, false);

    const inbox = await restRequest("admin_review_inbox?select=item_id&limit=1", { token: userA.token });
    assert.equal(inbox.response.ok, true);
    assert.deepEqual(inbox.data, []);
  }
);

await test(
  "2. Anonymous users cannot read profiles",
  async () => {
    const { response, data } =
      await restRequest("profiles?select=id,email,role&limit=1");

    assert.equal(
      response.status === 401 ||
      response.status === 403 ||
      (response.ok && Array.isArray(data) && data.length === 0),
      true
    );
  }
);

await test(
  "3. User A can create and read their own favorite",
  async () => {
    const insert =
      await restRequest(
        "favorites",
        {
          token: userA.token,
          method: "POST",
          prefer: "return=representation",
          body: {
            user_id: userA.user.id,
            event_id: favoriteEventId
          }
        }
      );

    assert.equal(insert.response.ok, true);

    const ownRows =
      await restRequest(
        `favorites?select=user_id,event_id&event_id=eq.${encodeURIComponent(favoriteEventId)}`,
        {
          token: userA.token
        }
      );

    assert.equal(ownRows.response.ok, true);
    assert.equal(ownRows.data.length, 1);
    assert.equal(ownRows.data[0].user_id, userA.user.id);
  }
);

await test(
  "4. User B cannot read or remove User A favorites",
  async () => {
    const foreignRead =
      await restRequest(
        `favorites?select=user_id,event_id&event_id=eq.${encodeURIComponent(favoriteEventId)}`,
        {
          token: userB.token
        }
      );

    assert.equal(foreignRead.response.ok, true);
    assert.deepEqual(foreignRead.data, []);

    const foreignDelete =
      await restRequest(
        `favorites?event_id=eq.${encodeURIComponent(favoriteEventId)}`,
        {
          token: userB.token,
          method: "DELETE",
          prefer: "return=representation"
        }
      );

    assert.equal(foreignDelete.response.ok, true);
    assert.deepEqual(foreignDelete.data, []);

    const stillExists =
      await restRequest(
        `favorites?select=event_id&event_id=eq.${encodeURIComponent(favoriteEventId)}`,
        {
          token: userA.token
        }
      );

    assert.equal(stillExists.data.length, 1);
  }
);

await test(
  "5. Users can only edit their own Season Planner entries",
  async () => {
    const insert =
      await restRequest(
        "season_planner_events",
        {
          token: userA.token,
          method: "POST",
          prefer: "return=representation",
          body: {
            user_id: userA.user.id,
            event_id: seasonEventId,
            priority: "B",
            planned_distance: "10 km"
          }
        }
      );

    assert.equal(insert.response.ok, true);

    const foreignUpdate =
      await restRequest(
        `season_planner_events?event_id=eq.${encodeURIComponent(seasonEventId)}`,
        {
          token: userB.token,
          method: "PATCH",
          prefer: "return=representation",
          body: {
            priority: "A"
          }
        }
      );

    assert.equal(foreignUpdate.response.ok, true);
    assert.deepEqual(foreignUpdate.data, []);

    const ownUpdate =
      await restRequest(
        `season_planner_events?event_id=eq.${encodeURIComponent(seasonEventId)}`,
        {
          token: userA.token,
          method: "PATCH",
          prefer: "return=representation",
          body: {
            priority: "A"
          }
        }
      );

    assert.equal(ownUpdate.response.ok, true);
    assert.equal(ownUpdate.data[0].priority, "A");
  }
);

await test(
  "6. User A can submit a pending event",
  async () => {
    const submission =
      await restRequest(
        "events",
        {
          token: userA.token,
          method: "POST",
          prefer: "return=representation",
          body: {
            event_name: `[RLS TEST] ${runId}`,
            sport: "Running",
            date: "31.12.2027",
            city: "Berlin",
            country: "Germany",
            address: "Test venue",
            latitude: 52.52,
            longitude: 13.405,
            distance: "5 km",
            event_url: "https://example.com/rls-test",
            status: "pending",
            created_by: userA.user.id
          }
        }
      );

    assert.equal(submission.response.ok, true);
    assert.equal(submission.data[0].status, "pending");
    submittedEventId = submission.data[0].id;
  }
);

await test(
  "7. User A cannot approve their own submission",
  async () => {
    assert.ok(submittedEventId);

    const approvalAttempt =
      await restRequest(
        `events?id=eq.${encodeURIComponent(submittedEventId)}`,
        {
          token: userA.token,
          method: "PATCH",
          prefer: "return=representation",
          body: {
            status: "approved"
          }
        }
      );

    assert.equal(
      approvalAttempt.response.status === 401 ||
      approvalAttempt.response.status === 403 ||
      (
        approvalAttempt.response.ok &&
        Array.isArray(approvalAttempt.data) &&
        approvalAttempt.data.length === 0
      ),
      true
    );

    const ownSubmission =
      await restRequest(
        `events?select=id,status&id=eq.${encodeURIComponent(submittedEventId)}`,
        {
          token: userA.token
        }
      );

    assert.equal(ownSubmission.data[0].status, "pending");
  }
);

await test(
  "8. Normal users cannot read an admin-wide pending overview",
  async () => {
    const pending =
      await restRequest(
        "events?select=id,created_by,status&status=eq.pending",
        {
          token: userA.token
        }
      );

    assert.equal(pending.response.ok, true);
    assert.equal(
      pending.data.every(row => row.created_by === userA.user.id),
      true
    );

    const analytics =
      await restRequest(
        "analytics_events?select=id&limit=1",
        {
          token: userA.token
        }
      );

    assert.equal(analytics.response.ok, true);
    assert.deepEqual(analytics.data, []);
  }
);

await test(
  "9. Admin can review and update pending events",
  async () => {
    const pending =
      await restRequest(
        `events?select=id,status&id=eq.${encodeURIComponent(submittedEventId)}`,
        {
          token: admin.token
        }
      );

    assert.equal(pending.response.ok, true);
    assert.equal(pending.data.length, 1);

    const approval =
      await restRequest(
        `events?id=eq.${encodeURIComponent(submittedEventId)}`,
        {
          token: admin.token,
          method: "PATCH",
          prefer: "return=representation",
          body: {
            status: "approved",
            reviewed_at:
              new Date().toISOString(),
            reviewed_by:
              admin.user.id
          }
        }
      );

    assert.equal(approval.response.ok, true);
    assert.equal(approval.data[0].status, "approved");
    assert.equal(approval.data[0].reviewed_by, admin.user.id);
    assert.ok(approval.data[0].reviewed_at);
  }
);

await test(
  "10. Normal users cannot assign themselves the admin role",
  async () => {
    const roleAttempt =
      await restRequest(
        `profiles?id=eq.${encodeURIComponent(userA.user.id)}`,
        {
          token: userA.token,
          method: "PATCH",
          prefer: "return=representation",
          body: {
            role: "admin"
          }
        }
      );

    assert.equal(
      roleAttempt.response.ok,
      false,
      "Role update unexpectedly succeeded"
    );

    const profile =
      await restRequest(
        `profiles?select=id,role&id=eq.${encodeURIComponent(userA.user.id)}`,
        {
          token: userA.token
        }
      );

    assert.equal(profile.data[0].role, "user");
  }
);

await test(
  "11. Anonymous users can read published editions but no operations data",
  async () => {
    const edition = await restRequest(
      `event_editions?select=id,event_id,publication_status&event_id=eq.${encodeURIComponent(publicFixtureEventId)}`
    );
    assert.equal(edition.response.ok, true);
    assert.equal(edition.data.length, 1);
    assert.equal(edition.data[0].publication_status, "published");

    for (const table of [
      "event_sources",
      "validation_issues",
      "event_audit_log",
      "crawler_domain_policies",
      "event_change_proposals",
      "event_field_controls",
      "data_workflow_runs",
      "data_workflow_alerts",
      "source_crawl_jobs",
      "source_crawl_results",
      "source_review_tasks",
      "source_domain_daily_metrics"
    ]) {
      const result = await restRequest(`${table}?select=id&limit=1`);
      assert.equal(
        result.response.status === 401 || result.response.status === 403,
        true,
        `Anonymous access to ${table} was not denied.`
      );
    }
  }
);

await test(
  "12. Normal users cannot read or mutate operations data",
  async () => {
    for (const table of [
      "event_sources",
      "validation_issues",
      "event_audit_log",
      "crawler_domain_policies",
      "event_change_proposals",
      "event_field_controls",
      "data_workflow_runs",
      "data_workflow_alerts",
      "source_crawl_jobs",
      "source_crawl_results",
      "source_review_tasks",
      "source_domain_daily_metrics"
    ]) {
      const result = await restRequest(`${table}?select=id&limit=1`, { token: userA.token });
      assert.equal(
        result.response.status === 401 || result.response.status === 403 ||
          (result.response.ok && Array.isArray(result.data) && result.data.length === 0),
        true,
        `Normal-user access to ${table} was not blocked.`
      );
    }

    for (const token of [null, userA.token]) {
      const settings = await restRequest("source_monitor_settings?select=singleton,max_attempts", token ? { token } : {});
      assert.equal(
        settings.response.status === 401 || settings.response.status === 403 ||
          (settings.response.ok && Array.isArray(settings.data) && settings.data.length === 0),
        true,
        "Non-admin Source Monitor settings access was not blocked."
      );
    }

    const update = await restRequest(
      `event_editions?event_id=eq.${encodeURIComponent(publicFixtureEventId)}`,
      {
        token: userA.token,
        method: "PATCH",
        prefer: "return=representation",
        body: { verification_status: "verified" }
      }
    );
    assert.equal(
      !update.response.ok || (Array.isArray(update.data) && update.data.length === 0),
      true,
      "Normal-user edition update unexpectedly changed a row."
    );
  }
);

await test(
  "13. Admin can validate, review issues, update editions and read immutable audit history",
  async () => {
    const validation = await restRequest("rpc/run_event_validation", {
      token: admin.token,
      method: "POST",
      body: { p_event_id: publicFixtureEventId }
    });
    assert.equal(validation.response.ok, true, JSON.stringify(validation.data));

    const editions = await restRequest(
      `event_editions?select=id&event_id=eq.${encodeURIComponent(publicFixtureEventId)}`,
      { token: admin.token }
    );
    assert.equal(editions.response.ok, true);
    assert.equal(editions.data.length, 1);

    const editionUpdate = await restRequest(
      `event_editions?id=eq.${encodeURIComponent(editions.data[0].id)}`,
      {
        token: admin.token,
        method: "PATCH",
        prefer: "return=representation",
        body: {
          verification_status: "verified",
          last_verified_at: new Date().toISOString(),
          needs_review: false
        }
      }
    );
    assert.equal(editionUpdate.response.ok, true, JSON.stringify(editionUpdate.data));
    assert.equal(editionUpdate.data.length, 1);

    const issues = await restRequest(
      `validation_issues?select=id,status,event_id&event_id=eq.${encodeURIComponent(publicFixtureEventId)}`,
      { token: admin.token }
    );
    assert.equal(issues.response.ok, true);
    assert.ok(issues.data.length > 0);

    const audit = await restRequest(
      `event_audit_log?select=id,entity_type,entity_id,field_name&entity_id=eq.${encodeURIComponent(publicFixtureEventId)}`,
      { token: admin.token }
    );
    assert.equal(audit.response.ok, true);
    assert.ok(audit.data.length > 0);

    const auditMutation = await restRequest(
      `event_audit_log?id=eq.${encodeURIComponent(audit.data[0].id)}`,
      {
        token: admin.token,
        method: "PATCH",
        prefer: "return=representation",
        body: { reason: "must not be mutable from the client" }
      }
    );
    assert.equal(auditMutation.response.ok, false);
  }
);

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  await test(
    "14. Automation proposals require admin review and source claims require service role",
    async () => {
      const editions = await serviceRequest(
        `event_editions?select=id&event_id=eq.${encodeURIComponent(publicFixtureEventId)}`
      );
      assert.equal(editions.response.ok, true, JSON.stringify(editions.data));
      const editionId = editions.data[0].id;

      const source = await serviceRequest("event_sources", {
        method: "POST",
        prefer: "return=representation",
        body: {
          event_id: publicFixtureEventId,
          edition_id: editionId,
          source_type: "official_event_website",
          source_url: `https://${runId}.example.com/event`,
          parser_type: "html",
          next_fetch_at: "2020-01-01T00:00:00.000Z"
        }
      });
      assert.equal(source.response.ok, true, JSON.stringify(source.data));

      const normalClaim = await restRequest("rpc/claim_event_sources", {
        token: userA.token,
        method: "POST",
        body: { p_limit: 1, p_worker_id: runId }
      });
      assert.equal(normalClaim.response.ok, false);

      const claim = await serviceRequest("rpc/claim_event_sources", {
        method: "POST",
        body: { p_limit: 20, p_worker_id: runId }
      });
      assert.equal(claim.response.ok, true, JSON.stringify(claim.data));
      assert.ok(claim.data.some(row => row.id === source.data[0].id));

      const proposal = await serviceRequest("event_change_proposals", {
        method: "POST",
        prefer: "return=representation",
        body: {
          event_id: publicFixtureEventId,
          edition_id: editionId,
          source_id: source.data[0].id,
          entity_type: "edition",
          rule_code: "rls_review_gate",
          proposal_fingerprint: runId,
          proposed_changes: { needs_review: true, review_priority: "high" },
          reason: "RLS integration test"
        }
      });
      assert.equal(proposal.response.ok, true, JSON.stringify(proposal.data));

      const normalApply = await restRequest("rpc/apply_event_change_proposal", {
        token: userA.token,
        method: "POST",
        body: { p_proposal_id: proposal.data[0].id, p_review_notes: "must fail" }
      });
      assert.equal(normalApply.response.ok, false);

      const adminApply = await restRequest("rpc/apply_event_change_proposal", {
        token: admin.token,
        method: "POST",
        body: { p_proposal_id: proposal.data[0].id, p_review_notes: "approved in test" }
      });
      assert.equal(adminApply.response.ok, true, JSON.stringify(adminApply.data));
      assert.equal(adminApply.data.proposal_status, "accepted");
    }
  );

  await test(
    "15. Server-side service role can access operations tables",
    async () => {
      for (const table of [
      "event_sources",
      "validation_issues",
      "event_audit_log",
      "crawler_domain_policies",
      "event_change_proposals",
      "event_field_controls",
      "data_workflow_runs",
      "data_workflow_alerts",
      "source_crawl_jobs",
      "source_crawl_results",
      "source_review_tasks",
      "source_domain_daily_metrics"
    ]) {
        const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`, {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        });
        assert.equal(response.ok, true, `${table} service-role request failed with ${response.status}`);
      }
    }
  );
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  await test(
    "16. Source Monitor queue is idempotent, leased server-side and preserves public event facts",
    async () => {
      const sources = await serviceRequest(
        `event_sources?select=id,event_id,edition_id,source_url&event_id=eq.${encodeURIComponent(publicFixtureEventId)}&source_url=like.*${encodeURIComponent(runId)}*`
      );
      assert.equal(sources.response.ok, true, JSON.stringify(sources.data));
      assert.equal(sources.data.length, 1);
      const source = sources.data[0];

      const publicFactsBefore = await restRequest(
        `events?select=event_name,date,city,distance,description,event_url&id=eq.${encodeURIComponent(publicFixtureEventId)}`,
        { token: admin.token }
      );
      assert.equal(publicFactsBefore.response.ok, true, JSON.stringify(publicFactsBefore.data));

      const normalSchedule = await restRequest("rpc/schedule_due_source_crawls", {
        token: userA.token,
        method: "POST",
        body: { p_limit: 20 }
      });
      assert.equal(normalSchedule.response.ok, false);

      const resetDomainPacing = await serviceRequest(
        `crawler_domain_policies?source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            last_requested_at: "2019-12-31T23:59:00.000Z",
            next_allowed_at: "2020-01-01T00:00:00.000Z"
          }
        }
      );
      assert.equal(resetDomainPacing.response.ok, true, JSON.stringify(resetDomainPacing.data));
      assert.equal(resetDomainPacing.data.length, 1);

      for (let index = 0; index < 2; index += 1) {
        const scheduled = await serviceRequest("rpc/schedule_due_source_crawls", {
          method: "POST",
          body: { p_limit: 20 }
        });
        assert.equal(scheduled.response.ok, true, JSON.stringify(scheduled.data));
      }

      const queued = await serviceRequest(
        `source_crawl_jobs?select=id,source_id,status,attempt_count&source_id=eq.${encodeURIComponent(source.id)}&status=in.(queued,retry_scheduled,processing)`
      );
      assert.equal(queued.response.ok, true, JSON.stringify(queued.data));
      assert.equal(queued.data.length, 1, "Duplicate active crawl jobs were created.");

      const workerId = `${runId}-source-monitor`;
      const claimed = await serviceRequest("rpc/claim_source_crawl_jobs", {
        method: "POST",
        body: { p_limit: 1, p_worker_id: workerId, p_source_id: source.id }
      });
      assert.equal(claimed.response.ok, true, JSON.stringify(claimed.data));
      assert.equal(claimed.data.length, 1);
      assert.equal(claimed.data[0].attempt_number, 1);

      const recorded = await serviceRequest("rpc/record_source_crawl_result", {
        method: "POST",
        body: {
          p_job_id: claimed.data[0].job_id,
          p_worker_id: workerId,
          p_outcome: "success",
          p_retriable: false,
          p_http_status: 200,
          p_final_url: source.source_url,
          p_redirect_count: 0,
          p_response_time_ms: 42,
          p_content_type: "text/html",
          p_content_length: 128,
          p_content_hash: `source-monitor-${runId}`,
          p_change_status: "first_seen",
          p_etag: "test-etag",
          p_last_modified: null,
          p_error_type: null,
          p_error_message: null,
          p_retry_after_seconds: null,
          p_worker_version: "rls-test",
          p_normalized_excerpt: null
        }
      });
      assert.equal(recorded.response.ok, true, JSON.stringify(recorded.data));
      assert.equal(recorded.data.status, "completed");
      const firstObservation = await serviceRequest("rpc/record_source_crawl_observation", {
        method: "POST",
        body: {
          p_job_id: claimed.data[0].job_id,
          p_semantic_hash: `semantic-${runId}`,
          p_normalization_version: "sem-v2",
          p_change_confidence: "baseline",
          p_change_reasons: ["first_seen"],
          p_http_status: 200,
          p_response_time_ms: 42,
          p_content_length: 128,
          p_pinned_ip: "93.184.216.34",
          p_error_type: null,
          p_retry_after_seconds: null,
          p_user_agent: "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)"
        }
      });
      assert.equal(firstObservation.response.ok, true, JSON.stringify(firstObservation.data));
      assert.equal(firstObservation.data.semantic_hash_recorded, true);
      assert.equal(firstObservation.data.pinned_ip_recorded, true);

      const results = await serviceRequest(
        `source_crawl_results?select=source_id,change_status,processing_status,http_status,semantic_hash,normalization_version,change_confidence,pinned_ip&job_id=eq.${encodeURIComponent(claimed.data[0].job_id)}`
      );
      assert.equal(results.response.ok, true, JSON.stringify(results.data));
      assert.deepEqual(results.data.map(row => row.change_status), ["first_seen"]);
      assert.deepEqual(results.data.map(row => row.processing_status), ["completed"]);

      assert.equal(results.data[0].semantic_hash, `semantic-${runId}`);
      assert.equal(results.data[0].normalization_version, "sem-v2");
      assert.equal(results.data[0].change_confidence, "baseline");
      assert.equal(results.data[0].pinned_ip, "93.184.216.34");
      const releaseForChangedCrawl = await serviceRequest(
        `crawler_domain_policies?source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            last_requested_at: "2019-12-31T23:59:00.000Z",
            next_allowed_at: "2020-01-01T00:00:00.000Z"
          }
        }
      );
      assert.equal(releaseForChangedCrawl.response.ok, true, JSON.stringify(releaseForChangedCrawl.data));
      const queuedChange = await serviceRequest("rpc/enqueue_source_crawl", {
        method: "POST",
        body: {
          p_source_id: source.id,
          p_priority: 1,
          p_scheduled_at: new Date().toISOString(),
          p_trigger_source: "test"
        }
      });
      assert.equal(queuedChange.response.ok, true, JSON.stringify(queuedChange.data));

      const changeWorkerId = `${runId}-source-change`;
      const claimedChange = await serviceRequest("rpc/claim_source_crawl_jobs", {
        method: "POST",
        body: { p_limit: 1, p_worker_id: changeWorkerId, p_source_id: source.id }
      });
      assert.equal(claimedChange.response.ok, true, JSON.stringify(claimedChange.data));
      assert.equal(claimedChange.data.length, 1);

      const changed = await serviceRequest("rpc/record_source_crawl_result", {
        method: "POST",
        body: {
          p_job_id: claimedChange.data[0].job_id,
          p_worker_id: changeWorkerId,
          p_outcome: "success",
          p_retriable: false,
          p_http_status: 200,
          p_final_url: source.source_url,
          p_redirect_count: 1,
          p_response_time_ms: 55,
          p_content_type: "text/html",
          p_content_length: 256,
          p_content_hash: `source-monitor-changed-${runId}`,
          p_change_status: "changed",
          p_etag: "test-etag-v2",
          p_last_modified: null,
          p_error_type: null,
          p_error_message: null,
          p_retry_after_seconds: null,
          p_worker_version: "rls-test",
          p_normalized_excerpt: "Changed fixture excerpt"
        }
      });
      assert.equal(changed.response.ok, true, JSON.stringify(changed.data));
      assert.equal(changed.data.change_status, "changed");
      const changedObservation = await serviceRequest("rpc/record_source_crawl_observation", {
        method: "POST",
        body: {
          p_job_id: claimedChange.data[0].job_id,
          p_semantic_hash: `semantic-changed-${runId}`,
          p_normalization_version: "sem-v2",
          p_change_confidence: "high",
          p_change_reasons: ["semantic_event_signals_changed"],
          p_http_status: 200,
          p_response_time_ms: 55,
          p_content_length: 256,
          p_pinned_ip: "93.184.216.34",
          p_error_type: null,
          p_retry_after_seconds: null,
          p_user_agent: "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)"
        }
      });
      assert.equal(changedObservation.response.ok, true, JSON.stringify(changedObservation.data));
      const repeatedObservation = await serviceRequest("rpc/record_source_crawl_observation", {
        method: "POST",
        body: {
          p_job_id: claimedChange.data[0].job_id,
          p_semantic_hash: `semantic-changed-${runId}`,
          p_normalization_version: "sem-v2",
          p_change_confidence: "high",
          p_change_reasons: ["semantic_event_signals_changed"],
          p_http_status: 200,
          p_response_time_ms: 55,
          p_content_length: 256,
          p_pinned_ip: "93.184.216.34",
          p_error_type: null,
          p_retry_after_seconds: null,
          p_user_agent: "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)"
        }
      });
      assert.equal(repeatedObservation.response.ok, true, JSON.stringify(repeatedObservation.data));
      assert.equal(repeatedObservation.data.idempotent, true);

      const domainMetrics = await serviceRequest(
        `source_domain_daily_metrics?select=request_count,success_count,changed_signal_count,rate_limited_count&source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`
      );
      assert.equal(domainMetrics.response.ok, true, JSON.stringify(domainMetrics.data));
      assert.equal(domainMetrics.data.length, 1);
      assert.equal(domainMetrics.data[0].request_count, 2);
      assert.equal(domainMetrics.data[0].success_count, 2);
      assert.equal(domainMetrics.data[0].changed_signal_count, 1);
      const releasedDomain = await serviceRequest(
        `crawler_domain_policies?source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            min_interval_seconds: 5,
            last_requested_at: null,
            next_allowed_at: "2020-01-01T00:00:00.000Z"
          }
        }
      );
      assert.equal(releasedDomain.response.ok, true, JSON.stringify(releasedDomain.data));
      assert.equal(releasedDomain.data.length, 1, JSON.stringify(releasedDomain.data));
      const queuedRateLimit = await serviceRequest("rpc/enqueue_source_crawl", {
        method: "POST",
        body: {
          p_source_id: source.id,
          p_priority: 1,
          p_scheduled_at: new Date().toISOString(),
          p_trigger_source: "test"
        }
      });
      assert.equal(queuedRateLimit.response.ok, true, JSON.stringify(queuedRateLimit.data));
      const rateLimitWorkerId = `${runId}-source-rate-limit`;
      const claimedRateLimit = await serviceRequest("rpc/claim_source_crawl_jobs", {
        method: "POST",
        body: { p_limit: 1, p_worker_id: rateLimitWorkerId, p_source_id: source.id }
      });
      assert.equal(claimedRateLimit.response.ok, true, JSON.stringify(claimedRateLimit.data));
      assert.equal(claimedRateLimit.data.length, 1);

      const rateLimited = await serviceRequest("rpc/record_source_crawl_result", {
        method: "POST",
        body: {
          p_job_id: claimedRateLimit.data[0].job_id,
          p_worker_id: rateLimitWorkerId,
          p_outcome: "error",
          p_retriable: true,
          p_http_status: 429,
          p_final_url: source.source_url,
          p_redirect_count: 0,
          p_response_time_ms: 61,
          p_content_type: "text/html",
          p_content_length: 64,
          p_content_hash: null,
          p_change_status: "unreachable",
          p_etag: null,
          p_last_modified: null,
          p_error_type: "http_429",
          p_error_message: "Rate limited fixture",
          p_retry_after_seconds: 120,
          p_worker_version: "rls-test",
          p_normalized_excerpt: "Rate limited fixture"
        }
      });
      assert.equal(rateLimited.response.ok, true, JSON.stringify(rateLimited.data));
      assert.equal(rateLimited.data.status, "retry_scheduled");

      const rateLimitObservation = await serviceRequest("rpc/record_source_crawl_observation", {
        method: "POST",
        body: {
          p_job_id: claimedRateLimit.data[0].job_id,
          p_semantic_hash: null,
          p_normalization_version: null,
          p_change_confidence: "technical",
          p_change_reasons: ["http_429"],
          p_http_status: 429,
          p_response_time_ms: 61,
          p_content_length: 64,
          p_pinned_ip: "93.184.216.34",
          p_error_type: "http_429",
          p_retry_after_seconds: 120,
          p_user_agent: "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)"
        }
      });
      assert.equal(rateLimitObservation.response.ok, true, JSON.stringify(rateLimitObservation.data));

      const adaptivePolicy = await serviceRequest(
        `crawler_domain_policies?select=adaptive_interval_seconds,rate_limit_events,next_allowed_at,last_user_agent&source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`
      );
      assert.equal(adaptivePolicy.response.ok, true, JSON.stringify(adaptivePolicy.data));
      assert.ok(adaptivePolicy.data[0].adaptive_interval_seconds >= 120);
      assert.equal(adaptivePolicy.data[0].rate_limit_events, 1);
      assert.match(adaptivePolicy.data[0].last_user_agent, /kontakt@sporteventmap\.com/);

      const metricsAfterRateLimit = await serviceRequest(
        `source_domain_daily_metrics?select=request_count,rate_limited_count&source_host=eq.${encodeURIComponent(new URL(source.source_url).hostname)}`
      );
      assert.equal(metricsAfterRateLimit.response.ok, true, JSON.stringify(metricsAfterRateLimit.data));
      assert.equal(metricsAfterRateLimit.data[0].request_count, 3);
      assert.equal(metricsAfterRateLimit.data[0].rate_limited_count, 1);

      const reviewTasks = await serviceRequest(
        `source_review_tasks?select=task_type,status,priority&source_id=eq.${encodeURIComponent(source.id)}&status=eq.open`
      );
      assert.equal(reviewTasks.response.ok, true, JSON.stringify(reviewTasks.data));
      assert.ok(reviewTasks.data.some(row => row.task_type === "content_changed" && row.priority === "low"));

      const sourceAudit = await serviceRequest(
        `event_audit_log?select=entity_type,entity_id,field_name,change_source&entity_type=eq.source&entity_id=eq.${encodeURIComponent(source.id)}`
      );
      assert.equal(sourceAudit.response.ok, true, JSON.stringify(sourceAudit.data));
      assert.ok(sourceAudit.data.some(row => row.field_name === "content_hash" && row.change_source === "crawler"));

      const changeAlert = await serviceRequest(
        `data_workflow_alerts?select=alert_code,alert_status&source_id=eq.${encodeURIComponent(source.id)}&alert_code=eq.source_content_changed`
      );
      assert.equal(changeAlert.response.ok, true, JSON.stringify(changeAlert.data));
      assert.equal(changeAlert.data.length, 1);

      const adminJobs = await restRequest(
        `source_crawl_jobs?select=id,status&source_id=eq.${encodeURIComponent(source.id)}`,
        { token: admin.token }
      );
      assert.equal(adminJobs.response.ok, true, JSON.stringify(adminJobs.data));
      const adminSettings = await restRequest("source_monitor_settings?select=singleton,max_attempts", { token: admin.token });
      assert.equal(adminSettings.response.ok, true, JSON.stringify(adminSettings.data));
      assert.equal(adminSettings.data.length, 1);

      const publicFactsAfter = await restRequest(
        `events?select=event_name,date,city,distance,description,event_url&id=eq.${encodeURIComponent(publicFixtureEventId)}`,
        { token: admin.token }
      );
      assert.deepEqual(publicFactsAfter.data, publicFactsBefore.data, "Crawler changed public event facts.");

      const normalBundleResolution = await restRequest("rpc/resolve_source_exception_bundle", {
        token: userA.token,
        method: "POST",
        body: { p_source_id: source.id, p_notes: "must not be allowed" }
      });
      assert.equal(normalBundleResolution.response.ok, false);

      const adminBundleResolution = await restRequest("rpc/resolve_source_exception_bundle", {
        token: admin.token,
        method: "POST",
        body: { p_source_id: source.id, p_notes: "RLS bundle test" }
      });
      assert.equal(adminBundleResolution.response.ok, true, JSON.stringify(adminBundleResolution.data));
      assert.equal(String(adminBundleResolution.data.source_id), String(source.id));
      assert.ok(Number.isInteger(Number(adminBundleResolution.data.resolved_tasks)));
      assert.ok(Number.isInteger(Number(adminBundleResolution.data.resolved_alerts)));
    }
  );

  await test(
    "17. First successor detection stays private and an admin can publish it before auto-confirmation",
    async () => {
      const sources = await serviceRequest(
        `event_sources?select=id,event_id&event_id=eq.${encodeURIComponent(publicFixtureEventId)}&limit=1`
      );
      assert.equal(sources.response.ok, true, JSON.stringify(sources.data));
      assert.equal(sources.data.length, 1);
      const source = sources.data[0];
      const crawlResults = await serviceRequest(
        `source_crawl_results?select=id&source_id=eq.${encodeURIComponent(source.id)}&order=fetched_at.desc&limit=1`
      );
      assert.equal(crawlResults.response.ok, true, JSON.stringify(crawlResults.data));
      assert.equal(crawlResults.data.length, 1);

      const detected = await serviceRequest("rpc/register_edition_successor_candidate", {
        method: "POST",
        body: {
          p_source_id: source.id,
          p_crawl_result_id: crawlResults.data[0].id,
          p_candidate: {
            year: 2028,
            start_date: "2028-12-30",
            end_date: "2028-12-30",
            name: `Lifecycle ${runId}`,
            registration_url: `https://example.com/${runId}/register-2028`,
            confidence: 0.97,
            evidence: { type: "json_ld" }
          },
          p_worker_version: "rls-lifecycle-test"
        }
      });
      assert.equal(detected.response.ok, true, JSON.stringify(detected.data));
      assert.equal(detected.data.status, "draft_created");
      assert.ok(detected.data.draft_edition_id);

      const anonymousDraft = await restRequest(
        `event_editions?select=id&id=eq.${encodeURIComponent(detected.data.draft_edition_id)}`
      );
      assert.equal(anonymousDraft.response.ok, true);
      assert.deepEqual(anonymousDraft.data, []);

      const normalInbox = await restRequest(
        `admin_review_inbox?select=item_id&item_id=eq.${encodeURIComponent(detected.data.candidate_id)}`,
        { token: userA.token }
      );
      assert.equal(normalInbox.response.ok, true);
      assert.deepEqual(normalInbox.data, []);

      const adminInbox = await restRequest(
        `admin_review_inbox?select=item_id,batch_action&item_id=eq.${encodeURIComponent(detected.data.candidate_id)}`,
        { token: admin.token }
      );
      assert.equal(adminInbox.response.ok, true, JSON.stringify(adminInbox.data));
      assert.deepEqual(adminInbox.data.map(row => row.batch_action), ["wait_automation"]);

      const approved = await restRequest("rpc/approve_edition_succession_candidates", {
        token: admin.token,
        method: "POST",
        body: { p_candidate_ids: [detected.data.candidate_id], p_limit: 1 }
      });
      assert.equal(approved.response.ok, true, JSON.stringify(approved.data));
      assert.equal(approved.data.approved_count, 1);

      const publicArchive = await restRequest(
        `public_event_archive?select=edition_id,edition_year,discovery_status&edition_id=eq.${encodeURIComponent(detected.data.draft_edition_id)}`
      );
      assert.equal(publicArchive.response.ok, true, JSON.stringify(publicArchive.data));
      assert.deepEqual(publicArchive.data.map(row => row.edition_year), [2028]);
      assert.deepEqual(publicArchive.data.map(row => row.discovery_status), ["active"]);
    }
  );
}

// Cleanup rows created by the test.
await restRequest(
  `favorites?event_id=eq.${encodeURIComponent(favoriteEventId)}`,
  {
    token: userA.token,
    method: "DELETE"
  }
);

await restRequest(
  `season_planner_events?event_id=eq.${encodeURIComponent(seasonEventId)}`,
  {
    token: userA.token,
    method: "DELETE"
  }
);

if (submittedEventId) {
  await restRequest(
    `events?id=eq.${encodeURIComponent(submittedEventId)}`,
    {
      token: admin.token,
      method: "DELETE"
    }
  );
}

if (publicFixtureEventId) {
  await restRequest(
    `events?id=eq.${encodeURIComponent(publicFixtureEventId)}`,
    {
      token: admin.token,
      method: "DELETE"
    }
  );
}

const failures =
  results.filter(result => !result.passed);

console.log(
  `\nRLS tests: ${results.length - failures.length}/${results.length} passed`
);

if (failures.length) {
  process.exit(1);
}
