import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const admin = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
const runtime = vm.createContext({});
vm.runInContext(admin.slice(admin.indexOf("function buildProposalCloseRequest("), admin.indexOf("function openProposalCloseDialog(")), runtime);
const proposal = { id: "one-proposal", proposal_status: "pending" };
const note = "Bereits im geprüften Faktenbatch umgesetzt.";
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(runtime.buildProposalCloseRequest(proposal, "superseded", `  ${note}  `)), {
  p_proposal_id: proposal.id, p_action: "superseded", p_review_notes: note
});
assert.deepEqual(plain(runtime.buildProposalCloseRequest(proposal, "rejected", note)), {
  p_proposal_id: proposal.id, p_action: "rejected", p_review_notes: note, p_rejection_reason: note
});
for (const notes of ["", "   ", "zu kurz"]) assert.throws(() => runtime.buildProposalCloseRequest(proposal, "rejected", notes), /mindestens 12/);
for (const status of ["accepted", "rejected", "superseded"]) assert.throws(() => runtime.buildProposalCloseRequest({ ...proposal, proposal_status: status }, "superseded", note), /nicht mehr offen/);
assert.throws(() => runtime.buildProposalCloseRequest(proposal, "accepted", note), /nicht unterstützt/);
for (const status of ["accepted", "edited_and_accepted", "rejected", "superseded"]) {
  const row = { id: proposal.id, proposal_status: status };
  assert.equal(runtime.getProposalReviewOutcome(row, proposal.id, status).type, "success");
  assert.ok(runtime.getProposalReviewOutcome([row], proposal.id, status).message.includes(`(${status})`));
}
for (const action of ["accepted", "edited_and_accepted"]) {
  const result = runtime.getProposalReviewOutcome({ id: proposal.id, proposal_status: "superseded" }, proposal.id, action);
  assert.equal(result.type, "error");
  assert.match(result.message, /nicht übernommen.*inzwischen geändert/);
}
for (const response of [null, {}, [], [{ id: proposal.id }, { id: proposal.id }], { id: "another", proposal_status: "rejected" }, { id: proposal.id, proposal_status: "pending" }, { id: proposal.id, proposal_status: "accepted" }]) {
  assert.throws(() => runtime.getProposalReviewOutcome(response, proposal.id, "rejected"), /Serverantwort|Vorschlagsstatus/);
}
const handler = admin.slice(admin.indexOf('if (["reject-proposal", "supersede-proposal"].includes(action)'), admin.indexOf('if (action === "defer-proposal"'));
assert.ok(handler.includes("openProposalCloseDialog"));
assert.doesNotMatch(handler, /window\.(prompt|confirm)|\.from\(/);
const editNote = "Distanz mit der offiziellen Ausschreibung abgeglichen.";
for (const [format, input, expected] of [
  ["text", " false ", "false"], ["text", "42", "42"], ["text", "https://race.example/register", "https://race.example/register"],
  ["json", "false", false], ["json", "0", 0],
  ["json", '[{"label":"10 km","distance_km":10},{"label":"5 km","distance_km":5}]', [{ label: "10 km", distance_km: 10 }, { label: "5 km", distance_km: 5 }]],
  ["json", '{"confirmed":false}', { confirmed: false }]
]) {
  assert.deepEqual(plain(runtime.buildProposalEditRequest(proposal, input, format, ` ${editNote} `)), {
    p_proposal_id: proposal.id, p_action: "edited_and_accepted", p_review_notes: editNote, p_edited_value: expected
  });
}
for (const [input, format, pattern] of [
  ["", "text", /Wert eintragen/], ["   ", "json", /Wert eintragen/],
  ['[{"distance_km":10}', "json", /gültiges JSON/], ["null", "json", /null/],
  ["1e999", "json", /endlich/], ['{"distance_km":1e999}', "json", /endlich/],
  ["value", "unknown", /Text oder JSON/]
]) assert.throws(() => runtime.buildProposalEditRequest(proposal, input, format, editNote), pattern);
assert.throws(() => runtime.buildProposalEditRequest(proposal, "text", "text", "zu kurz"), /mindestens 12/);
for (const status of ["accepted", "edited_and_accepted", "rejected", "superseded", "expired"]) {
  assert.throws(() => runtime.buildProposalEditRequest({ ...proposal, proposal_status: status }, "text", "text", editNote), /nicht mehr offen/);
}
assert.throws(() => runtime.buildProposalEditRequest(null, "text", "text", editNote), /nicht mehr offen/);
const context = { ...proposal, event_id: 39, edition_id: "edition", field_name: "race_formats", old_value: [{ label: "5 km" }] };
for (const [key, changed] of [["event_id", 429], ["edition_id", "other"], ["field_name", "description"], ["old_value", [{ label: "10 km" }]], ["normalized_value", false], ["source_url", "https://changed.example"]]) {
  assert.notEqual(runtime.getProposalEditContext(context), runtime.getProposalEditContext({ ...context, [key]: changed }));
}
const editHandler = admin.slice(admin.indexOf('if (action === "edit-proposal" && proposal)'), admin.indexOf('if (["reject-proposal", "supersede-proposal"].includes(action)'));
assert.match(editHandler, /openProposalEditDialog/);
assert.match(editHandler, /submitDataOpsProposalReview/);
assert.doesNotMatch(editHandler, /window\.(prompt|confirm)|\.from\(/);
console.log("Individual proposal closure, auditable reasons and exact RPC outcomes verified.");
