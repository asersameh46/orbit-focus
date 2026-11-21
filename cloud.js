(function (root) {
  const config = root.ORBIT_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && root.supabase);
  const client = configured
    ? root.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;

  async function getCaptchaToken() {
    if (!config.turnstileSiteKey || !root.turnstile) {
      throw new Error("Secure sign-in is not configured yet. Please try again later.");
    }

    return new Promise(function (resolve, reject) {
      const overlay = document.createElement("div");
      overlay.className = "captcha-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "captchaTitle");
      overlay.innerHTML =
        '<div class="captcha-dialog">' +
          '<h2 id="captchaTitle">Quick security check</h2>' +
          '<p>Complete this check to protect the community sign-in.</p>' +
          '<div class="captcha-widget"></div>' +
          '<button class="button button-reset" type="button">Cancel</button>' +
        '</div>';
      document.body.appendChild(overlay);

      const widgetContainer = overlay.querySelector(".captcha-widget");
      const cancelButton = overlay.querySelector("button");
      let widgetId;
      let settled = false;

      function finish(error, token) {
        if (settled) return;
        settled = true;
        if (widgetId !== undefined) root.turnstile.remove(widgetId);
        overlay.remove();
        if (error) reject(error);
        else resolve(token);
      }

      cancelButton.addEventListener("click", function () {
        finish(new Error("Security check was cancelled."));
      });

      widgetId = root.turnstile.render(widgetContainer, {
        sitekey: config.turnstileSiteKey,
        callback: function (token) { finish(null, token); },
        "error-callback": function () { finish(new Error("Security check failed. Please try again.")); },
        "expired-callback": function () { finish(new Error("Security check expired. Please try again.")); }
      });
    });
  }

  async function requireUser() {
    if (!client) throw new Error("Cloud services are not configured.");
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session) return current.data.session;
    const captchaToken = await getCaptchaToken();
    const signedIn = await client.auth.signInAnonymously({ options: { captchaToken: captchaToken } });
    if (signedIn.error) throw signedIn.error;
    if (!signedIn.data.session) throw new Error("Anonymous sign-in did not return a session.");
    return signedIn.data.session;
  }

  async function callRpc(name, args) {
    await requireUser();
    const result = await client.rpc(name, args || {});
    if (result.error) throw result.error;
    return result.data;
  }

  async function getProfile() {
    if (!client) throw new Error("Cloud services are not configured.");
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    if (!current.data.session) return null;
    return callRpc("get_my_profile");
  }

  async function joinLeaderboard(displayName) {
    return callRpc("join_leaderboard", { p_display_name: displayName });
  }

  async function leaveLeaderboard() {
    return callRpc("leave_leaderboard");
  }

  async function getLeaderboard() {
    if (!client) throw new Error("Cloud services are not configured.");
    const result = await client.rpc("get_leaderboard");
    if (result.error) throw result.error;
    return result.data;
  }

  async function recordSession(session) {
    if (!session || !session.completedAt || !Number.isFinite(session.duration)) return null;
    if (!client) return null;
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    if (!current.data.session) return null;
    const profile = await callRpc("get_my_profile");
    if (!profile || !profile.is_public) return null;
    return callRpc("record_focus_session", {
      p_session_id: String(session.completedAt),
      p_duration_ms: Math.round(session.duration)
    });
  }

  async function coach(message, session, history) {
    if (!client) {
      const localResponse = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message, session: session, history: history })
      });
      const localResult = await localResponse.json();
      if (!localResponse.ok) throw new Error(localResult.error || "Gemini is unavailable.");
      return localResult.text;
    }

    const authSession = await requireUser();
    const response = await fetch(config.supabaseUrl + "/functions/v1/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabaseAnonKey,
        "Authorization": "Bearer " + authSession.access_token
      },
      body: JSON.stringify({ message: message, session: session, history: history })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Gemini is unavailable.");
    return result.text;
  }

  root.OrbitCloud = {
    configured: configured,
    coach: coach,
    getLeaderboard: getLeaderboard,
    getProfile: getProfile,
    joinLeaderboard: joinLeaderboard,
    leaveLeaderboard: leaveLeaderboard,
    recordSession: recordSession
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
