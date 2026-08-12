import assert from "node:assert/strict";
import test from "node:test";
import { AGENTS, agentName, sanitizeAgentIds } from "../src/lib/agents";

test("Kimi work attribution uses current product names without changing the persisted Kimi Code id", () => {
  assert.equal(agentName("kimi"), "Kimi Code");
  assert.equal(agentName("kimi-agent"), "Kimi Agent");
  assert.equal(agentName("agent-swarm"), "Agent Swarm");
});

test("work attribution accepts every registered agent once", () => {
  const ids = AGENTS.map((agent) => agent.id);
  assert.deepEqual(sanitizeAgentIds([...ids, ids[0], "unknown"]), ids);
});
