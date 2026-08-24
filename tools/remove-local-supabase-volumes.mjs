import assert from "node:assert/strict";
import http from "node:http";

const projectId = process.argv[2];
assert.match(
  projectId || "",
  /^sport-event-map-recovery-drill-[a-f0-9]{8}$/,
  "Refusing to remove volumes for an unexpected project id."
);

function request(method, requestPath) {
  return new Promise((resolve, reject) => {
    const call = http.request({
      socketPath: "\\\\.\\pipe\\docker_engine",
      path: requestPath,
      method
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body ? JSON.parse(body) : null);
          return;
        }
        reject(new Error(`Docker Engine ${method} ${requestPath} failed (${response.statusCode}): ${body}`));
      });
    });
    call.setTimeout(10000, () => call.destroy(new Error("Docker Engine request timed out.")));
    call.on("error", reject);
    call.end();
  });
}

const label = `com.supabase.cli.project=${projectId}`;
const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
const result = await request("GET", `/volumes?filters=${filters}`);

for (const volume of result?.Volumes || []) {
  assert.equal(
    volume.Labels?.["com.supabase.cli.project"],
    projectId,
    `Refusing to remove unexpectedly labelled Docker volume ${volume.Name}.`
  );
  await request("DELETE", `/volumes/${encodeURIComponent(volume.Name)}`);
  process.stdout.write(`Removed disposable restore volume ${volume.Name}.\n`);
}
