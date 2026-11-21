const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

globalThis.ORBIT_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };
require("./cloud.js");
const cloud = globalThis.OrbitCloud;

test("keeps leaderboard unavailable when cloud configuration is missing", async function () {
  assert.equal(cloud.configured, false);
  await assert.rejects(cloud.getLeaderboard(), /not configured/);
  assert.equal(await cloud.recordSession({ completedAt: Date.now(), duration: 60000 }), null);
});

test("preserves local Gemini endpoint when cloud configuration is absent", async function () {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody = null;
  globalThis.fetch = async function (url, options) {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ text: "A local coach reply." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const answer = await cloud.coach("Help me focus", { status: "idle" }, []);
    assert.equal(answer, "A local coach reply.");
    assert.equal(requestUrl, "/api/coach");
    assert.equal(requestBody.message, "Help me focus");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends a Turnstile token when creating an anonymous Supabase session", async function () {
  let signInOptions;
  const client = {
    auth: {
      getSession: async function () {
        return { data: { session: null }, error: null };
      },
      signInAnonymously: async function (options) {
        signInOptions = options;
        return { data: { session: { access_token: "test-session" } }, error: null };
      }
    },
    rpc: async function () {
      return { data: true, error: null };
    }
  };
  const context = {
    ORBIT_CONFIG: {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "public-test-key",
      turnstileSiteKey: "public-turnstile-site-key"
    },
    supabase: { createClient: function () { return client; } },
    turnstile: {
      render: function (_container, options) {
        queueMicrotask(function () { options.callback("captcha-test-token"); });
        return "widget-id";
      },
      remove: function () {}
    },
    document: {
      createElement: function () {
        return {
          setAttribute: function () {},
          querySelector: function () { return { addEventListener: function () {} }; },
          remove: function () {}
        };
      },
      body: { appendChild: function () {} }
    },
    Promise: Promise,
    queueMicrotask: queueMicrotask
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "cloud.js"), "utf8"), context);

  await context.OrbitCloud.joinLeaderboard("OrbitLearner");

  assert.equal(signInOptions.options.captchaToken, "captcha-test-token");
});

test("sends friend actions through authenticated Supabase RPCs", async function () {
  const calls = [];
  const client = {
    auth: {
      getSession: async function () {
        return { data: { session: { access_token: "test-session" } }, error: null };
      }
    },
    rpc: async function (name, args) {
      calls.push({ name: name, args: args || {} });
      return { data: true, error: null };
    }
  };
  const context = {
    ORBIT_CONFIG: {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "public-test-key"
    },
    supabase: { createClient: function () { return client; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "cloud.js"), "utf8"), context);

  await context.OrbitCloud.getMyFriends();
  await context.OrbitCloud.addFriend("ABCDEF123456");
  await context.OrbitCloud.respondFriendRequest("ABCDEF123456", true);
  await context.OrbitCloud.removeFriend("ABCDEF123456");

  assert.equal(JSON.stringify(calls), JSON.stringify([
    { name: "get_my_friends", args: {} },
    { name: "add_friend", args: { p_friend_code: "ABCDEF123456" } },
    { name: "respond_friend_request", args: { p_friend_code: "ABCDEF123456", p_accept: true } },
    { name: "remove_friend", args: { p_friend_code: "ABCDEF123456" } }
  ]));
});
