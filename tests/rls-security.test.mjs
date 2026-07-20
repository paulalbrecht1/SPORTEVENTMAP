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

assert.equal(publicFixtureInsert.response.ok, true);
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
