const assert = require("node:assert/strict");
const test = require("node:test");
const coach = require("./ai-coach.js");

test("classifies common focus needs", function () {
  assert.equal(coach.classifyIntent("I feel overwhelmed"), "overwhelm");
  assert.equal(coach.classifyIntent("Help me get started"), "procrastination");
  assert.equal(coach.classifyIntent("How many minutes should I focus?"), "time");
});

test("adapts time guidance to a running session", function () {
  const answer = coach.reply("How long should I focus?", {
    status: "running",
    duration: 50 * 60 * 1000
  });
  assert.match(answer, /50 minutes focus session/);
});

test("uses stored progress when answering progress questions", function () {
  const answer = coach.reply("How is my progress?", {
    completedSessions: 3,
    credits: 750
  });
  assert.match(answer, /3 focus sessions/);
  assert.match(answer, /750 credits/);
});

test("gives a specific study plan and handles empty messages", function () {
  assert.match(coach.reply("Help me study for an exam", {}), /25-minute study block/);
  assert.match(coach.reply("", {}), /one small next step/);
});
