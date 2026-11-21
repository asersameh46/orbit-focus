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
          '<p>Complete this check to protect your account.</p>' +
          '<div class="captcha-widget"></div>' +
          '<button class="button button-reset" type="button">Cancel</button>' +
        '</div>';
      document.body.appendChild(overlay);

      const widgetContainer = overlay.querySelector(".captcha-widget");
      const cancelButton = overlay.querySelector("button");
      let widgetId;
      let settled = false;

      function finish(error, token, removeWidget) {
        if (settled) return;
        settled = true;
        if (widgetId !== undefined && removeWidget !== false) root.turnstile.remove(widgetId);
        overlay.remove();
        if (error) reject(error);
        else resolve(token);
      }

      cancelButton.addEventListener("click", function () {
        finish(new Error("Security check was cancelled."), null, true);
      });

      widgetId = root.turnstile.render(widgetContainer, {
        sitekey: config.turnstileSiteKey,
        callback: function (token) { finish(null, token); },
        "error-callback": function (errorCode) {
          const hostname = root.location && root.location.hostname;
          if (String(errorCode) === "110200" && (hostname === "localhost" || hostname === "127.0.0.1")) {
            const message = "Local email sign-in is blocked by the security check. Use " +
              "https://asersameh46.github.io/orbit-focus/ or add localhost and 127.0.0.1 " +
              "to the Turnstile widget's allowed hostnames in Cloudflare.";
            finish(new Error(message), null, false);
            return;
          }
          finish(new Error("Security check failed. Please try again."), null, false);
        },
        "expired-callback": function () { finish(new Error("Security check expired. Please try again."), null, true); }
      });
    });
  }

  async function requireUser() {
    if (!client) throw new Error("Cloud services are not configured.");
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    const user = current.data.session && current.data.session.user;
    if (!user || !user.email || user.is_anonymous) {
      throw new Error("Sign in with your email to use Orbit Focus.");
    }
    return current.data.session;
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

  async function getAuthSession() {
    if (!client) throw new Error("Cloud services are not configured.");
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session;
  }

  function watchAuth(callback) {
    if (!client) return function () {};
    const result = client.auth.onAuthStateChange(function (_event, session) {
      callback(session);
    });
    return function () { result.data.subscription.unsubscribe(); };
  }

  async function sendEmailLink(email) {
    if (!client) throw new Error("Cloud services are not configured.");
    const captchaToken = await getCaptchaToken();
    const result = await client.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
        captchaToken: captchaToken,
        emailRedirectTo: root.location.origin + root.location.pathname
      }
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signOut() {
    if (!client) throw new Error("Cloud services are not configured.");
    const result = await client.auth.signOut();
    if (result.error) throw result.error;
  }

  async function updateProfile(displayName) {
    return callRpc("update_profile", { p_display_name: displayName });
  }

  async function getMyStats() {
    return callRpc("get_my_stats");
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

  async function getMyFriends() {
    return callRpc("get_my_friends");
  }

  async function addFriend(friendCode) {
    return callRpc("add_friend", { p_friend_code: friendCode });
  }

  async function respondFriendRequest(friendCode, accept) {
    return callRpc("respond_friend_request", { p_friend_code: friendCode, p_accept: accept });
  }

  async function removeFriend(friendCode) {
    return callRpc("remove_friend", { p_friend_code: friendCode });
  }

  async function recordSession(session) {
    if (!session || !session.completedAt || !Number.isFinite(session.duration)) return null;
    if (!client) return null;
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    if (!current.data.session) return null;
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
    addFriend: addFriend,
    getAuthSession: getAuthSession,
    getLeaderboard: getLeaderboard,
    getMyFriends: getMyFriends,
    getMyStats: getMyStats,
    getProfile: getProfile,
    joinLeaderboard: joinLeaderboard,
    leaveLeaderboard: leaveLeaderboard,
    removeFriend: removeFriend,
    respondFriendRequest: respondFriendRequest,
    recordSession: recordSession,
    sendEmailLink: sendEmailLink,
    signOut: signOut,
    updateProfile: updateProfile,
    watchAuth: watchAuth
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
