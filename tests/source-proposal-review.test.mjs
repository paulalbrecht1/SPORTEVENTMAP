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
console.log("Individual proposal closure, auditable reasons and exact RPC outcomes verified.");
