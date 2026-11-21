(function () {
  const h = React.createElement;
  const STORAGE_KEY = "orbit-focus-state-v1";
  const MAX_DURATION = 24 * 60 * 60 * 1000;
  const PRESETS = [
    { minutes: 25, title: "25 min", subtitle: "Quick focus" },
    { minutes: 50, title: "50 min", subtitle: "Deep work" },
    { minutes: 120, title: "2 hours", subtitle: "Get in the zone" },
    { minutes: 360, title: "6 hours", subtitle: "Big project" },
    { minutes: 720, title: "12 hours", subtitle: "Long haul" },
    { minutes: 1440, title: "24 hours", subtitle: "All in" }
  ];
  const NAV_ITEMS = [
    { id: "overview", label: "Overview", icon: "home" },
    { id: "focus", label: "Focus room", icon: "clock" },
    { id: "rewards", label: "My rewards", icon: "gift" },
    { id: "leaderboard", label: "Leaderboard", icon: "trophy" },
    { id: "coach", label: "AI focus coach", icon: "bot" },
    { id: "appearance", label: "Appearance", icon: "palette" }
  ];
  const THEMES = [
    { id: "prism", name: "Prism", detail: "Electric violet, laser lime, and cosmic blue.", colors: ["#6755ff", "#c5a5ff", "#b8ff70"] },
    { id: "glacier", name: "Glacier", detail: "Glacial blue, bright aqua, and silver light.", colors: ["#3289ff", "#91d7ff", "#7effe2"] },
    { id: "jungle", name: "Jungle", detail: "Deep canopy, vivid fern, and citrus.", colors: ["#237c5c", "#8fe7a1", "#d8ff72"] },
    { id: "solar", name: "Solar flare", detail: "Hot coral, molten gold, and pink nebula.", colors: ["#ff715e", "#ffba62", "#ffa4cf"] },
    { id: "rosewave", name: "Rosewave", detail: "Saturated berry, soft rose, and cool lilac.", colors: ["#a63e88", "#ff8fc7", "#ae9aff"] }
  ];

  function playSound(name) {
    window.OrbitSounds.play(name);
  }

  function makeEmptyState() {
    return {
      credits: 0,
      duration: 25 * 60 * 1000,
      remaining: 25 * 60 * 1000,
      status: "idle",
      endAt: null,
      pendingReward: 0,
      completedSessions: 0,
      totalFocusMs: 0,
      history: []
    };
  }

  function initialState() {
    const empty = makeEmptyState();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return empty;
      const parsed = JSON.parse(saved);
      if (!parsed || !Number.isFinite(parsed.duration)) return empty;

      const duration = Math.min(MAX_DURATION, Math.max(60 * 1000, parsed.duration));
      const history = Array.isArray(parsed.history) ? parsed.history.filter(function (item) {
        return item && Number.isFinite(item.completedAt) && Number.isFinite(item.duration) && Number.isFinite(item.credits);
      }).slice(0, 20) : [];
      let restored = Object.assign({}, empty, {
        credits: Number.isFinite(parsed.credits) ? Math.max(0, Math.floor(parsed.credits)) : 0,
        duration: duration,
        remaining: Math.max(0, Math.min(duration, Number(parsed.remaining) || 0)),
        status: parsed.status,
        endAt: Number.isFinite(parsed.endAt) ? parsed.endAt : null,
        pendingReward: Number.isFinite(parsed.pendingReward) ? Math.max(0, parsed.pendingReward) : 0,
        completedSessions: Number.isFinite(parsed.completedSessions) ? Math.max(0, parsed.completedSessions) : history.length,
        totalFocusMs: Number.isFinite(parsed.totalFocusMs) ? Math.max(0, parsed.totalFocusMs) : history.reduce(function (total, item) { return total + item.duration; }, 0),
        history: history
      });

      if (restored.status === "running" && restored.endAt !== null) {
        restored.remaining = Math.max(0, restored.endAt - Date.now());
        if (restored.remaining === 0) restored = completeState(restored);
      } else if (restored.status !== "paused" && restored.status !== "completed") {
        restored.status = "idle";
        restored.remaining = duration;
        restored.endAt = null;
      }

      if (restored.status === "completed" && restored.pendingReward < 1) {
        restored.status = "idle";
        restored.remaining = duration;
      }
      return restored;
    } catch (error) {
      console.error("Could not restore the saved focus session.", error);
      return empty;
    }
  }

  function completeState(current) {
    const reward = Math.round(current.duration / 6000);
    return Object.assign({}, current, {
      credits: current.credits + reward,
      remaining: 0,
      status: "completed",
      endAt: null,
      pendingReward: reward,
      completedSessions: current.completedSessions + 1,
      totalFocusMs: current.totalFocusMs + current.duration,
      history: [{ completedAt: Date.now(), duration: current.duration, credits: reward }].concat(current.history || []).slice(0, 20)
    });
  }

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return [
      Math.floor(seconds / 3600),
      Math.floor((seconds % 3600) / 60),
      seconds % 60
    ].map(function (value) { return String(value).padStart(2, "0"); }).join(":");
  }

  function formatDuration(milliseconds) {
    const minutes = Math.round(milliseconds / 60000);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute" : " minutes");
    const hours = Math.floor(minutes / 60);
    const leftover = minutes % 60;
    return hours + (hours === 1 ? " hour" : " hours") + (leftover ? " " + leftover + " min" : "");
  }

  function formatFocusTotal(milliseconds) {
    const totalMinutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours + "h " + minutes + "m";
  }

  function Icon(props) {
    const common = { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" };
    const stroke = { stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" };
    if (props.name === "play") return h("svg", Object.assign({}, common, { fill: "currentColor" }), h("path", { d: "M8 5.8c0-.8.9-1.3 1.6-.9l9.1 5.3a1 1 0 0 1 0 1.7l-9.1 5.3a1.05 1.05 0 0 1-1.6-.9V5.8Z" }));
    if (props.name === "pause") return h("svg", Object.assign({}, common, { fill: "currentColor" }), h("path", { d: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" }));
    if (props.name === "orbit") return h("svg", Object.assign({}, common, { fill: "currentColor" }),
      h("circle", { cx: "12", cy: "12", r: "2" }),
      h("path", { d: "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Z", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }),
      h("path", { d: "M5.2 6.1c3.4-2.9 8.5-2.1 11.4 1.7s2.8 8.9-.6 11.7", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
    if (props.name === "spark") return h("svg", Object.assign({}, common, { fill: "currentColor" }),
      h("path", { d: "m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2Z" }),
      h("path", { d: "m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" }));
    if (props.name === "check") return h("svg", Object.assign({}, common, stroke), h("path", { d: "m5 12 4 4L19 6" }));
    if (props.name === "arrow") return h("svg", Object.assign({}, common, stroke), h("path", { d: "M5 12h14m-6-6 6 6-6 6" }));
    if (props.name === "friends") return h("svg", Object.assign({}, common, stroke),
      h("circle", { cx: "9", cy: "8", r: "3" }),
      h("path", { d: "M3.5 20v-1a5.5 5.5 0 0 1 11 0v1M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8V20" }));
    if (props.name === "home") return h("svg", Object.assign({}, common, stroke), h("path", { d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" }));
    if (props.name === "clock") return h("svg", Object.assign({}, common, stroke), h("circle", { cx: "12", cy: "12", r: "9" }), h("path", { d: "M12 7v5l3 2" }));
    if (props.name === "gift") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M4 10h16v11H4zM3 6h18v4H3zM12 6v15" }),
      h("path", { d: "M12 6H8.5a2 2 0 1 1 2-2c0 1.1 1.5 2 1.5 2Zm0 0h3.5a2 2 0 1 0-2-2c0 1.1-1.5 2-1.5 2Z" }));
    if (props.name === "bot") return h("svg", Object.assign({}, common, stroke),
      h("rect", { x: "4", y: "7", width: "16", height: "13", rx: "4" }),
      h("path", { d: "M12 3v4m-4 6h.01M16 13h.01M9 17h6" }),
      h("circle", { cx: "12", cy: "3", r: "1" }));
    if (props.name === "trophy") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4" }));
    if (props.name === "palette") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.6-3.2 1.8 1.8 0 0 1 1.4-2.9H18a3 3 0 0 0 3-3c0-5-4-8.9-9-8.9Z" }),
      h("circle", { cx: "7.5", cy: "11", r: ".8", fill: "currentColor" }),
      h("circle", { cx: "10", cy: "7.5", r: ".8", fill: "currentColor" }),
      h("circle", { cx: "14", cy: "7.5", r: ".8", fill: "currentColor" }));
    if (props.name === "sound") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M11 5 6 9H3v6h3l5 4V5Z" }),
      h("path", { d: "M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" }));
    if (props.name === "mute") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M11 5 6 9H3v6h3l5 4V5Z" }),
      h("path", { d: "m16 9 5 6m0-6-5 6" }));
    if (props.name === "sun") return h("svg", Object.assign({}, common, stroke),
      h("circle", { cx: "12", cy: "12", r: "4" }),
      h("path", { d: "M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" }));
    if (props.name === "moon") return h("svg", Object.assign({}, common, stroke),
      h("path", { d: "M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" }));
    return null;
  }

  function Sidebar(props) {
    return h("aside", { className: "sidebar" },
      h("a", { className: "brand", href: "#overview", onClick: function (event) { event.preventDefault(); props.onNavigate("overview"); } },
        h("span", { className: "brand-mark" }, h("img", { src: "assets/orbit-logo.svg", alt: "" })),
        h("span", { className: "brand-word" }, "Orbit")),
      h("div", { className: "sidebar-caption" }, "ORBIT FOCUS WORKSPACE"),
      h("nav", { className: "main-nav", "aria-label": "Main menu" },
        NAV_ITEMS.map(function (item) {
          return h("button", {
            className: "nav-item" + (props.page === item.id ? " active" : ""),
            type: "button",
            key: item.id,
            "aria-current": props.page === item.id ? "page" : undefined,
            onClick: function () { props.onNavigate(item.id); }
          },
            h("span", { className: "nav-icon" }, h(Icon, { name: item.icon })),
            h("span", null, item.label),
            item.id === "coach" ? h("span", { className: "nav-new" }, "NEW") : null);
        })),
      h("div", { className: "sidebar-bottom" },
        h("div", { className: "sidebar-orb" }, h(Icon, { name: "spark" })),
        h("strong", null, "Your next level is closer."),
        h("p", null, "Every focused minute adds credits to your card."),
        h("button", { type: "button", className: "sidebar-focus-link", onClick: function () { props.onNavigate("focus"); } },
          "Start a session", h(Icon, { name: "arrow" })),
        h("div", { className: "privacy-note" }, h("span", null), "Saved on this device")));
  }

  function PageHeader(props) {
    return h("section", { className: "page-heading" },
      h("div", null,
        h("div", { className: "eyebrow" }, h("span", { className: "eyebrow-line" }), props.eyebrow),
        h("h1", null, props.title),
        h("p", null, props.description)),
      props.action || null);
  }

  function RewardsCard(props) {
    const credits = props.session.credits;
    const tier = credits >= 5000 ? "COSMIC" : credits >= 1000 ? "NOVA" : "ORBIT";
    return h("section", { className: "orbit-card", "aria-label": "Orbit focus rewards card" },
      h("div", { className: "card-gloss" }),
      h("div", { className: "card-top" },
        h("div", { className: "card-brand" }, h("span", { className: "card-brand-icon" }, h("img", { src: "assets/orbit-logo.svg", alt: "" })), h("span", null, "orbit")),
        h("span", { className: "card-contactless", "aria-label": "Contactless" }, h("i"), h("i"), h("i"))),
      h("div", { className: "card-chip", "aria-label": "Card chip" },
        h("span", { className: "chip-line chip-line-one" }), h("span", { className: "chip-line chip-line-two" }),
        h("span", { className: "chip-line chip-line-three" }), h("span", { className: "chip-line chip-line-four" })),
      h("div", { className: "card-balance-label" }, "YOUR FOCUS BALANCE"),
      h("div", { className: "card-balance" }, credits.toLocaleString(), h("span", null, "CR")),
      h("div", { className: "card-number" }, "••••  ••••  ••••  0428"),
      h("div", { className: "card-bottom" },
        h("div", null, h("span", { className: "card-caption" }, "CARDHOLDER"), h("span", { className: "card-holder" }, "FOCUS IS A SUPERPOWER")),
        h("div", { className: "card-tier" }, h("span", null, "✦"), " ", tier)),
      h("div", { className: "card-shine", "aria-hidden": "true" }));
  }

  function TimerPanel(props) {
    return h("section", { className: "timer-panel", "aria-label": "Focus timer" },
      h("div", { className: "panel-topline" },
        h("div", { className: "session-state" }, h("span", { className: "status-orb" }), h("span", null, props.statusText)),
        h("span", { className: "session-type" }, "FOCUS SESSION")),
      h("div", { className: "timer-layout" },
        h("div", { className: "timer-ring", role: "timer", "aria-label": "Time remaining " + formatTime(props.remaining) },
          h("svg", { viewBox: "0 0 240 240", "aria-hidden": "true" },
            h("defs", null, h("linearGradient", { id: "ringGradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
              h("stop", { offset: "0%", stopColor: "var(--ui-highlight)" }), h("stop", { offset: "55%", stopColor: "var(--ui-accent)" }), h("stop", { offset: "100%", stopColor: "var(--ui-secondary)" }))),
            h("circle", { className: "ring-track", cx: "120", cy: "120", r: "108" }),
            h("circle", { className: "ring-value", cx: "120", cy: "120", r: "108", style: {
              strokeDasharray: String(2 * Math.PI * 108),
              strokeDashoffset: String(2 * Math.PI * 108 * (1 - props.progress))
            } })),
          h("div", { className: "ring-center" },
            h("div", { className: "time-value" }, formatTime(props.remaining)),
            h("div", { className: "time-units" }, "HRS  ·  MIN  ·  SEC"))),
        h("div", { className: "timer-side" },
          h("div", { className: "timer-kicker" }, "MAKE THIS MOMENT"),
          h("h2", null, props.session.status === "running" ? "All yours." : "Count on you."),
          h("p", { className: "timer-message", "aria-live": "polite" }, props.message),
          h("div", { className: "timer-buttons" },
            h("button", { className: "button button-start", type: "button", onClick: props.onStart,
              "aria-label": props.session.status === "running" ? "Pause focus timer" : props.session.status === "paused" ? "Resume focus timer" : "Start focus timer" },
              h(Icon, { name: props.session.status === "running" ? "pause" : "play" }),
              props.session.status === "running" ? "Pause" : props.session.status === "paused" ? "Resume" : "Start focusing"),
            props.active ? h("button", { className: "button button-reset", type: "button", onClick: props.onReset }, "Reset") : null))),
      h("div", { className: "timer-footnote" }, h(Icon, { name: "spark" }), h("span", null, "Your timer saves automatically on this device.")));
  }

  function DurationPicker(props) {
    return h("section", { className: "duration-panel", "aria-labelledby": "durationTitle" },
      h("div", { className: "duration-heading" },
        h("div", null, h("h2", { id: "durationTitle" }, "Set your pace"), h("p", null, "Short sprint or all-day flow. You choose.")),
        h("span", { className: "max-time" }, "UP TO 24 HOURS")),
      h("div", { className: "preset-grid", "aria-label": "Timer presets" },
        PRESETS.map(function (preset) {
          const selected = props.session.duration === preset.minutes * 60000;
          return h("button", { className: "preset" + (selected ? " selected" : ""), type: "button", key: preset.minutes,
            disabled: props.active, "aria-pressed": selected,
            onClick: function () { props.onChoose(preset.minutes * 60000); } },
            h("span", { className: "preset-title" }, preset.title),
            h("span", { className: "preset-subtitle" }, preset.subtitle),
            selected ? h("span", { className: "preset-check" }, h(Icon, { name: "check" })) : null);
        })),
      h("div", { className: "custom-time" },
        h("label", { htmlFor: "customHours" }, "MAKE IT YOUR OWN"),
        h("div", { className: "custom-controls" },
          h("div", { className: "custom-inputs" },
            h("div", { className: "number-input" },
              h("input", { id: "customHours", type: "number", min: "0", max: "24", value: props.hours, disabled: props.active,
                onChange: function (event) { props.setHours(event.target.value); }, "aria-label": "Custom hours" }),
              h("span", null, "HRS")),
            h("span", { className: "input-colon" }, ":"),
            h("div", { className: "number-input" },
              h("input", { id: "customMinutes", type: "number", min: "0", max: "59", value: props.minutes, disabled: props.active,
                onChange: function (event) { props.setMinutes(event.target.value); }, "aria-label": "Custom minutes" }),
              h("span", null, "MIN"))),
          h("button", { className: "button button-set", type: "button", disabled: props.active, onClick: props.onCustom }, "Set time"))),
      props.notice ? h("p", { className: "form-notice", role: "alert" }, props.notice) : null);
  }

  function OverviewPage(props) {
    const hours = props.session.completedSessions;
    const stats = [
      { label: "Sessions finished", value: hours.toLocaleString(), icon: "check" },
      { label: "Time in your zone", value: formatFocusTotal(props.session.totalFocusMs), icon: "clock" },
      { label: "Credits collected", value: props.session.credits.toLocaleString(), icon: "spark" }
    ];
    return h("div", { className: "page-stack" },
      h(PageHeader, { eyebrow: "YOUR PERSONAL SPACE", title: "Make room for your best work.", description: "A calmer day starts with one intentional session." }),
      h("section", { className: "welcome-panel" },
        h("div", { className: "welcome-decoration" }, h(Icon, { name: "orbit" })),
        h("div", { className: "welcome-copy" },
          h("div", { className: "welcome-kicker" }, "THE NEXT HOUR IS YOURS"),
          h("h2", null, props.session.status === "running" ? "You're already in flow." : "Start where you are."),
          h("p", null, props.session.status === "running" ? "Your focus session is ticking. Keep your attention on one thing." : "Pick a session that feels right. No pressure to do it all at once."),
          h("button", { className: "button button-start", type: "button", onClick: function () { props.onNavigate("focus"); } },
            props.session.status === "running" || props.session.status === "paused" ? "Open focus room" : "Set up a focus session",
            h(Icon, { name: "arrow" }))),
        h("div", { className: "welcome-time" },
          h("span", null, props.session.status === "running" || props.session.status === "paused" ? "TIME LEFT" : "UP NEXT"),
          h("strong", null, formatTime(props.remaining)),
          h("span", null, props.session.status === "running" ? "SESSION IN PROGRESS" : formatDuration(props.session.duration)))),
      h("div", { className: "stat-grid" },
        stats.map(function (stat) {
          return h("article", { className: "stat-card", key: stat.label },
            h("span", { className: "stat-icon" }, h(Icon, { name: stat.icon })),
            h("span", { className: "stat-value" }, stat.value),
            h("span", { className: "stat-label" }, stat.label));
        })),
      h("div", { className: "overview-lower" },
        h("section", { className: "activity-panel" },
          h("div", { className: "section-title-row" },
            h("div", null, h("h2", null, "Recent focus"), h("p", null, "Every finished session counts.")),
            h("button", { className: "text-link", type: "button", onClick: function () { props.onNavigate("rewards"); } }, "View history", h(Icon, { name: "arrow" }))),
          props.session.history.length
            ? h("div", { className: "activity-list" }, props.session.history.slice(0, 3).map(function (item, index) {
                return h("div", { className: "activity-item", key: item.completedAt + "-" + index },
                  h("span", { className: "activity-check" }, h(Icon, { name: "check" })),
                  h("span", { className: "activity-name" }, formatDuration(item.duration), h("small", null, new Date(item.completedAt).toLocaleDateString())),
                  h("strong", { className: "activity-credit" }, "+" + item.credits + " CR"));
              }))
            : h("div", { className: "empty-activity" }, h("span", { className: "empty-icon" }, h(Icon, { name: "spark" })),
                h("strong", null, "Your first win is waiting."),
                h("span", null, "Finish a session to see it here."))),
        h("div", { className: "overview-card-wrap" },
          h(RewardsCard, { session: props.session }),
          h("button", { className: "card-action-link", type: "button", onClick: function () { props.onNavigate("rewards"); } },
            "Explore your rewards", h(Icon, { name: "arrow" })))));
  }

  function FocusPage(props) {
    return h("div", { className: "page-stack" },
      h(PageHeader, { eyebrow: "FOCUS ROOM", title: "One thing at a time.", description: "Choose your timer, settle in, and let the rest wait." }),
      h("div", { className: "focus-page-grid" },
        h("div", { className: "focus-main-column" },
          h(TimerPanel, props),
          h(DurationPicker, props)),
        h("aside", { className: "focus-aside" },
          h("div", { className: "focus-ritual" },
            h("div", { className: "ritual-icon" }, h(Icon, { name: "spark" })),
            h("div", { className: "ritual-label" }, "A TINY RITUAL"),
            h("h2", null, "Before you begin"),
            h("p", null, "Name the one thing that would make this session feel like a win. Then let everything else be background."),
            h("div", { className: "ritual-divider" }),
            h("span", { className: "ritual-quote" }, "“Slow is smooth, smooth is fast.”")),
          h("button", { className: "coach-nudge", type: "button", onClick: function () { props.onNavigate("coach"); } },
            h("span", { className: "coach-nudge-icon" }, h(Icon, { name: "bot" })),
            h("span", null, h("strong", null, "Need a little help?"), h("small", null, "Talk it through with your coach")),
            h(Icon, { name: "arrow" })))));
  }

  function RewardsPage(props) {
    const nextMilestone = Math.ceil((props.session.credits + 1) / 1000) * 1000;
    const progress = (props.session.credits % 1000) / 10;
    return h("div", { className: "page-stack" },
      h(PageHeader, { eyebrow: "YOUR LITTLE WINS", title: "You earned every bit.", description: "A small reminder that showing up is worth something." }),
      h("div", { className: "rewards-layout" },
        h("div", { className: "rewards-main" },
          h(RewardsCard, { session: props.session }),
          h("section", { className: "milestone-panel" },
            h("div", { className: "milestone-heading" },
              h("span", { className: "milestone-icon" }, h(Icon, { name: "spark" })),
              h("div", null, h("h2", null, "Your next orbit"), h("p", null, nextMilestone.toLocaleString(), " credit milestone"))),
            h("div", { className: "milestone-numbers" },
              h("strong", null, props.session.credits.toLocaleString()),
              h("span", null, " / ", nextMilestone.toLocaleString(), " credits")),
            h("div", { className: "milestone-track" }, h("span", { style: { width: progress + "%" } })),
            h("p", { className: "milestone-note" }, Math.max(0, nextMilestone - props.session.credits).toLocaleString(), " credits to your next milestone")),
          h("section", { className: "activity-panel history-panel" },
            h("div", { className: "section-title-row" }, h("div", null, h("h2", null, "Your focus history"), h("p", null, "The moments you made time for."))),
            props.session.history.length
              ? h("div", { className: "activity-list" }, props.session.history.map(function (item, index) {
                  return h("div", { className: "activity-item", key: item.completedAt + "-history-" + index },
                    h("span", { className: "activity-check" }, h(Icon, { name: "check" })),
                    h("span", { className: "activity-name" }, formatDuration(item.duration), h("small", null, new Date(item.completedAt).toLocaleString())),
                    h("strong", { className: "activity-credit" }, "+" + item.credits + " CR"));
                }))
              : h("div", { className: "empty-activity" }, h("span", { className: "empty-icon" }, h(Icon, { name: "gift" })),
                  h("strong", null, "Your story starts with one session."),
                  h("span", null, "Complete a focus session to earn your first credits.")))),
        h("aside", { className: "reward-side" },
          h("section", { className: "reward-info-card" },
            h("span", { className: "reward-info-icon" }, h(Icon, { name: "spark" })),
            h("div", { className: "reward-info-label" }, "THE ORBIT RULE"),
            h("h2", null, "Time turns into momentum."),
            h("p", null, "Finish your timer and earn 10 credits for every focused minute. Your balance stays saved on this device."),
            h("div", { className: "reward-tiers" },
              h("div", null, h("span", null, "01"), h("strong", null, "Orbit"), h("small", null, "Your first focus wins")),
              h("div", null, h("span", null, "02"), h("strong", null, "Nova"), h("small", null, "1,000 credits")),
              h("div", null, h("span", null, "03"), h("strong", null, "Cosmic"), h("small", null, "5,000 credits")))))));
  }

  function FriendsPanel(props) {
    function submit(event) {
      event.preventDefault();
      props.onAddFriend();
    }

    const friends = props.data && Array.isArray(props.data.friends) ? props.data.friends : [];
    const incoming = props.data && Array.isArray(props.data.incoming) ? props.data.incoming : [];
    const outgoing = props.data && Array.isArray(props.data.outgoing) ? props.data.outgoing : [];

    return h("section", { className: "friends-panel" },
      h("div", { className: "leaderboard-heading" },
        h("span", { className: "leaderboard-icon" }, h(Icon, { name: "friends" })),
        h("div", null, h("h2", null, "Your friends"), h("p", null, "Add people with their private 12-character friend code."))),
      props.error ? h("p", { className: "leaderboard-notice friends-error", role: "alert" }, props.error) : null,
      props.notice ? h("p", { className: "leaderboard-notice", role: "status" }, props.notice) : null,
      !props.profile || !props.profile.is_public
        ? h("div", { className: "leaderboard-empty" }, "Join the leaderboard to get your private friend code and add friends.")
        : h(React.Fragment, null,
            h("div", { className: "friends-code-card" },
              h("div", null,
                h("span", { className: "friends-code-label" }, "YOUR FRIEND CODE"),
                h("strong", { className: "friends-code" }, props.profile.friend_code || "Loading…")),
              h("button", { className: "button button-reset", type: "button", disabled: !props.profile.friend_code, onClick: props.onCopyCode }, "Copy code")),
            h("form", { className: "friends-add-form", onSubmit: submit },
              h("label", { htmlFor: "friendCode" }, "Add a friend"),
              h("div", null,
                h("input", { id: "friendCode", type: "text", maxLength: 12, minLength: 12, required: true,
                  pattern: "[A-Fa-f0-9]{12}", autoComplete: "off", autoCapitalize: "characters",
                  value: props.code, onChange: function (event) { props.setCode(event.target.value.toUpperCase()); },
                  placeholder: "Enter their friend code", "aria-describedby": "friendCodeHelp" }),
                h("button", { className: "button button-start", type: "submit", disabled: props.loading }, props.loading ? "Sending…" : "Send request")),
              h("small", { id: "friendCodeHelp" }, "Ask them to share their code with you.")),
            incoming.length
              ? h("div", { className: "friends-group" },
                  h("h3", null, "Friend requests"),
                  incoming.map(function (request) {
                    return h("div", { className: "friend-row", key: request.friend_code },
                      h("span", { className: "friend-name" }, request.display_name),
                      h("button", { className: "button button-start", type: "button", disabled: props.loading,
                        onClick: function () { props.onRespond(request.friend_code, true); } }, "Accept"),
                      h("button", { className: "button button-reset", type: "button", disabled: props.loading,
                        onClick: function () { props.onRespond(request.friend_code, false); } }, "Decline"));
                  }))
              : null,
            outgoing.length
              ? h("div", { className: "friends-group" },
                  h("h3", null, "Sent requests"),
                  outgoing.map(function (request, index) {
                    return h("div", { className: "friend-row friend-outgoing", key: request.display_name + index },
                      h("span", { className: "friend-name" }, request.display_name),
                      h("span", { className: "friend-pending" }, "Pending"));
                  }))
              : null,
            h("div", { className: "friends-group" },
              h("h3", null, "Friends · " + friends.length),
              friends.length
                ? h("div", { className: "friends-list" }, friends.map(function (friend) {
                    return h("div", { className: "friend-row", key: friend.friend_code },
                      h("span", { className: "friend-name" }, friend.display_name),
                      h("span", { className: "friend-score" }, Number(friend.credits).toLocaleString() + " CR"),
                      h("button", { className: "button button-reset", type: "button", disabled: props.loading,
                        onClick: function () { props.onRemove(friend); } }, "Remove"));
                  }))
                : h("div", { className: "leaderboard-empty" }, "No friends yet. Share your code or enter a friend's code to get started."))),
      h("p", { className: "leaderboard-privacy" }, "Friend codes are only shared when you choose to copy or send them. You can remove a friend at any time."));
  }

  function LeaderboardPage(props) {
    function submit(event) {
      event.preventDefault();
      props.onJoin();
    }

    return h("div", { className: "page-stack" },
      h(PageHeader, { eyebrow: "THE ORBIT COMMUNITY", title: "Focus, together.", description: "See the community’s focus credits. Joining is optional; only your chosen display name and shared score are public." }),
      h("section", { className: "leaderboard-panel" },
        h("div", { className: "leaderboard-heading" },
          h("span", { className: "leaderboard-icon" }, h(Icon, { name: "trophy" })),
          h("div", null, h("h2", null, "Top focus members"), h("p", null, "Ranked by completed-session credits")),
          h("button", { className: "leaderboard-refresh", type: "button", disabled: props.loading || !props.configured, onClick: props.onRefresh }, props.loading ? "Loading…" : "Refresh")),
        props.notice ? h("p", { className: "leaderboard-notice", role: "status" }, props.notice) : null,
        !props.configured
          ? h("div", { className: "leaderboard-empty" }, "Connect a Supabase project to load the shared leaderboard.")
          : props.loading && !props.entries.length
            ? h("div", { className: "leaderboard-empty", role: "status" }, "Loading the community leaderboard…")
            : props.error
              ? h("div", { className: "leaderboard-empty", role: "alert" }, props.error)
              : props.entries.length
                ? h("div", { className: "leaderboard-list" }, props.entries.map(function (entry, index) {
                    return h("div", { className: "leaderboard-row", key: entry.rank || index },
                      h("span", { className: "leaderboard-rank" }, String(entry.rank || index + 1).padStart(2, "0")),
                      h("span", { className: "leaderboard-member" }, entry.display_name),
                      h("span", { className: "leaderboard-sessions" }, entry.completed_sessions + " sessions"),
                      h("strong", { className: "leaderboard-score" }, Number(entry.credits).toLocaleString() + " CR"));
                  }))
                : h("div", { className: "leaderboard-empty" }, "No one has joined yet. You can be the first.")),
      h("section", { className: "leaderboard-join-panel" },
        h("div", null,
          h("h2", null, props.profile && props.profile.is_public ? "You’re on the board" : "Join the leaderboard"),
          h("p", null, "Your browser gets a private anonymous account. No email or real name is requested.")),
        props.profile && props.profile.is_public
          ? h("div", { className: "leaderboard-current" },
              h("span", null, props.profile.display_name),
              h("strong", null, Number(props.profile.credits).toLocaleString() + " CR"),
              h("button", { className: "button button-reset", type: "button", disabled: props.loading, onClick: props.onLeave }, "Leave leaderboard"))
          : h("form", { className: "leaderboard-form", onSubmit: submit },
              h("label", { htmlFor: "leaderboardName" }, "Choose a display name"),
              h("div", null,
                h("input", { id: "leaderboardName", type: "text", maxLength: 24, minLength: 2, required: true,
                  value: props.name, onChange: function (event) { props.setName(event.target.value); },
                  placeholder: "e.g. OrbitLearner", autoComplete: "nickname" }),
                h("button", { className: "button button-start", type: "submit", disabled: props.loading || !props.configured }, props.loading ? "Joining…" : "Join"))),
        h("p", { className: "leaderboard-privacy" }, "Only opt in if you’re comfortable sharing this nickname and your score. Points are client-awarded and can be gamed; don’t use them for prizes or high-stakes competition.")),
      h(FriendsPanel, {
        profile: props.profile,
        data: props.friends,
        code: props.friendCode,
        setCode: props.setFriendCode,
        loading: props.loading,
        error: props.friendError,
        notice: props.friendNotice,
        onAddFriend: props.onAddFriend,
        onRespond: props.onRespondFriend,
        onRemove: props.onRemoveFriend,
        onCopyCode: props.onCopyCode
      }));
  }

  function CoachPage(props) {
    function submit(event) {
      event.preventDefault();
      const text = props.draft.trim();
      if (!text) return;
      props.onSend(text);
    }
    return h("div", { className: "page-stack coach-page" },
      h(PageHeader, { eyebrow: "YOUR FOCUS COACH", title: "Let’s untangle the next step.", description: "A calm place to make a plan, reset, or just get started." }),
      h("section", { className: "coach-chat" },
        h("div", { className: "chat-header" },
          h("div", { className: "chat-avatar" }, h(Icon, { name: "bot" })),
          h("div", null, h("strong", null, "Orbit Coach"), h("span", null, props.loading ? "Gemini · thinking…" : "Gemini AI coach · replies adapt to your focus session")),
          h("span", { className: "coach-online" }, h("i"), "HERE FOR YOU")),
        h("div", { className: "chat-messages", role: "log", "aria-live": "polite" },
          props.messages.map(function (message, index) {
            return h("div", { className: "chat-row " + message.role, key: "message-" + index },
              message.role === "assistant" ? h("span", { className: "chat-mini-avatar" }, h(Icon, { name: "spark" })) : null,
              h("p", null, message.text));
          })),
        h("div", { className: "prompt-label" }, "TRY ASKING"),
        h("div", { className: "prompt-chips" },
          ["Help me get started", "Build me a study plan", "I feel overwhelmed", "How is my progress?"].map(function (prompt) {
            return h("button", { type: "button", key: prompt, onClick: function () { props.onSend(prompt); } }, prompt);
          })),
        h("form", { className: "chat-form", onSubmit: submit },
          h("input", { type: "text", value: props.draft, onChange: function (event) { props.setDraft(event.target.value); },
            placeholder: "Tell me what’s on your mind…", "aria-label": "Message your focus coach", maxLength: 500 }),
          h("button", { className: "button button-start", type: "submit", disabled: !props.draft.trim() || props.loading, "aria-label": "Send message" }, h(Icon, { name: "arrow" }))),
        h("p", { className: "coach-disclaimer" }, "When Gemini is configured, your message and focus-session context are sent to the model. Otherwise, Orbit uses local replies.")));
  }

  function AppearancePage(props) {
    return h("div", { className: "page-stack" },
        h(PageHeader, { eyebrow: "WORKSPACE PREFERENCES", title: "Set the tone.", description: "Choose a color palette and display mode for your Orbit workspace." }),
        h("section", { className: "appearance-panel mode-panel" },
          h("div", { className: "appearance-heading" },
            h("div", null, h("h2", null, "Display mode"), h("p", null, "Go easy on the eyes, day or night.")),
            h("span", { className: "appearance-saved" }, h("i"), "SAVED AUTOMATICALLY")),
          h("div", { className: "mode-choice-grid" },
            ["dark", "light"].map(function (item) {
              const isSelected = props.mode === item;
              return h("button", {
                className: "mode-choice" + (isSelected ? " selected" : ""),
                type: "button",
                key: item,
                "aria-pressed": isSelected,
                onClick: function () { props.onModeChange(item); }
              },
                h("span", { className: "mode-choice-icon" }, h(Icon, { name: item === "dark" ? "moon" : "sun" })),
                h("span", null,
                  h("strong", null, item === "dark" ? "Dark mode" : "Light mode"),
                  h("small", null, item === "dark" ? "Deep space, low-glare panels." : "Bright canvas, soft contrast.")),
                isSelected ? h("span", { className: "theme-selected-mark" }, h(Icon, { name: "check" })) : null);
            }))),
        h("section", { className: "appearance-panel" },
          h("div", { className: "appearance-heading" },
            h("div", null, h("h2", null, "Color theme"), h("p", null, "A little atmosphere goes a long way.")),
            h("span", { className: "appearance-saved" }, h("i"), "SAVED AUTOMATICALLY")),
          h("div", { className: "theme-grid" },
            THEMES.map(function (item) {
              return h("button", {
                className: "theme-choice" + (props.theme === item.id ? " selected" : ""),
                type: "button",
                key: item.id,
                "aria-pressed": props.theme === item.id,
                onClick: function () { props.onChange(item.id); }
              },
                h("span", { className: "theme-swatch", style: { background: "linear-gradient(135deg, " + item.colors.join(", ") + ")" } },
                  h("i"), h("i"), h("i")),
                h("span", { className: "theme-choice-info" },
                  h("strong", null, item.name),
                  h("small", null, item.detail)),
                props.theme === item.id ? h("span", { className: "theme-selected-mark" }, h(Icon, { name: "check" })) : null);
            })),
          h("div", { className: "appearance-note" },
            h("span", { className: "appearance-note-icon" }, h(Icon, { name: "spark" })),
            h("div", null,
              h("strong", null, "Designed for a calmer workday"),
              h("p", null, "Each palette keeps the same clear contrast and focus-friendly layout. Switch themes whenever you like.")))),
        h("section", { className: "brand-note" },
          h("div", { className: "brand-note-logo" }, h("span", { className: "brand-mark" }, h("img", { src: "assets/orbit-logo.svg", alt: "" })), h("strong", null, "Orbit Focus")),
          h("p", null, "A personal focus workspace for intentional work, thoughtful breaks, and small wins.")));
  }

  function App() {
    const [session, setSession] = React.useState(initialState);
    const [page, setPage] = React.useState("overview");
    const [mode, setMode] = React.useState(function () { return window.OrbitThemeMode.getInitialMode(); });
    const [theme, setTheme] = React.useState(function () {
        try {
          const savedTheme = localStorage.getItem("orbit-theme-v1");
          return THEMES.some(function (item) { return item.id === savedTheme; }) ? savedTheme : "prism";
        } catch (error) {
          console.error("Could not restore the appearance preference.", error);
          return "prism";
        }
    });
    const [soundEnabled, setSoundEnabled] = React.useState(function () { return window.OrbitSounds.isEnabled(); });
    const [hours, setHours] = React.useState("0");
    const [minutes, setMinutes] = React.useState("25");
    const [notice, setNotice] = React.useState("");
    const [chatDraft, setChatDraft] = React.useState("");
    const [chatLoading, setChatLoading] = React.useState(false);
    const [leaderboardName, setLeaderboardName] = React.useState("");
    const [leaderboardProfile, setLeaderboardProfile] = React.useState(null);
    const [leaderboardEntries, setLeaderboardEntries] = React.useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = React.useState(false);
    const [leaderboardError, setLeaderboardError] = React.useState("");
    const [leaderboardNotice, setLeaderboardNotice] = React.useState("");
    const [friends, setFriends] = React.useState({ friends: [], incoming: [], outgoing: [] });
    const [friendCode, setFriendCode] = React.useState("");
    const [friendError, setFriendError] = React.useState("");
    const [friendNotice, setFriendNotice] = React.useState("");
    const [chatMessages, setChatMessages] = React.useState([
      { role: "assistant", text: "Hey, I’m your Orbit focus coach. Tell me what you’re working on, or ask me to help you choose a session." }
    ]);
    const sessionRef = React.useRef(session);
    sessionRef.current = session;
    const previousStatus = React.useRef(session.status);
    const active = session.status === "running" || session.status === "paused";
    const remaining = session.status === "running" ? Math.max(0, session.endAt - Date.now()) : session.remaining;
    const progress = Math.max(0, Math.min(1, remaining / session.duration));

    function commit(next) {
      sessionRef.current = next;
      setSession(next);
    }

    function navigate(nextPage) {
      playSound("tap");
      setPage(nextPage);
    }

    function changeTheme(nextTheme) {
      playSound("theme");
      setTheme(nextTheme);
    }

    function changeMode(nextMode) {
      playSound("theme");
      setMode(nextMode);
    }

    function toggleSound() {
      const next = !soundEnabled;
      window.OrbitSounds.setEnabled(next);
      setSoundEnabled(next);
      if (next) playSound("toggle");
    }

    React.useEffect(function () {
      document.body.dataset.theme = theme;
      try {
        localStorage.setItem("orbit-theme-v1", theme);
      } catch (error) {
        console.error("Could not save the appearance preference.", error);
      }
    }, [theme]);

    React.useEffect(function () {
      window.OrbitThemeMode.apply(mode);
      window.OrbitThemeMode.save(mode);
    }, [mode]);

    React.useEffect(function () {
      if (previousStatus.current !== "completed" && session.status === "completed") {
        playSound("complete");
        const completedSession = session.history && session.history[0];
        if (window.OrbitCloud.configured && completedSession) {
          window.OrbitCloud.recordSession(completedSession).catch(function (error) {
            console.error("Could not add the completed session to the leaderboard.", error);
            setLeaderboardNotice("Your session is saved on this device, but its leaderboard score could not be synced.");
          });
        }
      }
      previousStatus.current = session.status;
    }, [session.status]);

    React.useEffect(function () {
      try {
        const toSave = Object.assign({}, session, {
          remaining: session.status === "running" && session.endAt ? Math.max(0, session.endAt - Date.now()) : session.remaining
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (error) {
        console.error("Could not save your focus session.", error);
        setNotice("Saving is unavailable in this browser.");
      }
    }, [session.credits, session.duration, session.status, session.endAt, session.pendingReward, session.completedSessions,
      session.totalFocusMs, session.history, session.status === "running" ? 0 : session.remaining]);

    React.useEffect(function () {
      if (session.status !== "running") return undefined;
      const interval = window.setInterval(function () {
        const current = sessionRef.current;
        const timeLeft = Math.max(0, current.endAt - Date.now());
        commit(timeLeft <= 0 ? completeState(current) : Object.assign({}, current, { remaining: timeLeft }));
      }, 1000);
      return function () { window.clearInterval(interval); };
    }, [session.status, session.endAt]);

    React.useEffect(function () {
      if (session.status !== "completed") return undefined;
      const timeout = window.setTimeout(function () {
        const button = document.getElementById("collectReward");
        if (button) button.focus();
      }, 0);
      return function () { window.clearTimeout(timeout); };
    }, [session.status]);

    async function refreshLeaderboard() {
      if (!window.OrbitCloud.configured) return;
      setLeaderboardLoading(true);
      setLeaderboardError("");
      try {
        const results = await Promise.all([
          window.OrbitCloud.getLeaderboard(),
          window.OrbitCloud.getProfile()
        ]);
        setLeaderboardEntries(Array.isArray(results[0]) ? results[0] : []);
        setLeaderboardProfile(results[1] || null);
        if (results[1] && results[1].display_name) setLeaderboardName(results[1].display_name);
        if (results[1] && results[1].is_public) {
          try {
            setFriends(await window.OrbitCloud.getMyFriends());
            setFriendError("");
          } catch (error) {
            console.error("Could not load friend details.", error);
            setFriendError("Could not load friends. Check that the latest Supabase schema has been applied.");
          }
        } else {
          setFriends({ friends: [], incoming: [], outgoing: [] });
          setFriendError("");
        }
      } catch (error) {
        console.error("Could not load the leaderboard.", error);
        setLeaderboardError("Could not load the shared leaderboard. Check the Supabase setup and try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    React.useEffect(function () {
      if (page === "leaderboard") refreshLeaderboard();
    }, [page]);

    async function joinLeaderboard() {
      setLeaderboardLoading(true);
      setLeaderboardError("");
      setLeaderboardNotice("");
      try {
        const profile = await window.OrbitCloud.joinLeaderboard(leaderboardName);
        setLeaderboardProfile(profile);
        await refreshLeaderboard();
        setLeaderboardNotice("You joined the public leaderboard. Your display name and score are visible to everyone.");
      } catch (error) {
        console.error("Could not join the leaderboard.", error);
        setLeaderboardError(error.message || "Could not join the leaderboard. Try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    async function leaveLeaderboard() {
      setLeaderboardLoading(true);
      setLeaderboardError("");
      setLeaderboardNotice("");
      try {
        await window.OrbitCloud.leaveLeaderboard();
        setLeaderboardProfile(null);
        setLeaderboardNotice("You left the leaderboard. Your previous public scores are hidden.");
        await refreshLeaderboard();
      } catch (error) {
        console.error("Could not leave the leaderboard.", error);
        setLeaderboardError("Could not update your leaderboard privacy setting. Try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    async function addFriend() {
      setLeaderboardLoading(true);
      setFriendError("");
      setFriendNotice("");
      try {
        const request = await window.OrbitCloud.addFriend(friendCode.trim());
        setFriendCode("");
        setFriendNotice("Friend request sent to " + request.display_name + ".");
        await refreshLeaderboard();
      } catch (error) {
        console.error("Could not send friend request.", error);
        setFriendError(error.message || "Could not send friend request. Check the code and try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    async function respondFriendRequest(code, accept) {
      setLeaderboardLoading(true);
      setFriendError("");
      setFriendNotice("");
      try {
        const result = await window.OrbitCloud.respondFriendRequest(code, accept);
        setFriendNotice(accept ? result.display_name + " is now your friend." : "Friend request declined.");
        await refreshLeaderboard();
      } catch (error) {
        console.error("Could not respond to friend request.", error);
        setFriendError(error.message || "Could not update friend request. Try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    async function removeFriend(friend) {
      if (!window.confirm("Remove " + friend.display_name + " from your friends?")) return;
      setLeaderboardLoading(true);
      setFriendError("");
      setFriendNotice("");
      try {
        const removed = await window.OrbitCloud.removeFriend(friend.friend_code);
        if (!removed) throw new Error("Friendship no longer exists.");
        setFriendNotice(friend.display_name + " was removed from your friends.");
        await refreshLeaderboard();
      } catch (error) {
        console.error("Could not remove friend.", error);
        setFriendError(error.message || "Could not remove friend. Try again.");
      } finally {
        setLeaderboardLoading(false);
      }
    }

    async function copyFriendCode() {
      try {
        if (!navigator.clipboard || !leaderboardProfile || !leaderboardProfile.friend_code) {
          throw new Error("Copy is not available in this browser.");
        }
        await navigator.clipboard.writeText(leaderboardProfile.friend_code);
        setFriendError("");
        setFriendNotice("Friend code copied. Share it only with people you want to add.");
      } catch (error) {
        console.error("Could not copy friend code.", error);
        setFriendError("Could not copy the friend code. Select and copy it manually.");
      }
    }

    function chooseDuration(milliseconds) {
      const current = sessionRef.current;
      commit(Object.assign({}, current, { duration: milliseconds, remaining: milliseconds, status: "idle", endAt: null, pendingReward: 0 }));
      setNotice("");
      playSound("select");
    }

    function setCustomDuration() {
      const hourValue = Number(hours);
      const minuteValue = Number(minutes);
      const totalMinutes = hourValue * 60 + minuteValue;
      if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 24 ||
          !Number.isInteger(minuteValue) || minuteValue < 0 || minuteValue > 59 ||
          totalMinutes < 1 || totalMinutes > 1440) {
        setNotice("Choose a time between 1 minute and 24 hours.");
        return;
      }
      chooseDuration(totalMinutes * 60000);
    }

    function startOrPause() {
      const current = sessionRef.current;
      if (current.status === "running") {
        commit(Object.assign({}, current, { remaining: Math.max(0, current.endAt - Date.now()), status: "paused", endAt: null }));
        playSound("pause");
      } else if (current.status === "paused") {
        commit(Object.assign({}, current, { status: "running", endAt: Date.now() + current.remaining }));
        playSound("start");
      } else {
        const timeLeft = current.remaining > 0 ? current.remaining : current.duration;
        commit(Object.assign({}, current, { status: "running", remaining: timeLeft, endAt: Date.now() + timeLeft, pendingReward: 0 }));
        playSound("start");
      }
    }

    function resetSession() {
      const current = sessionRef.current;
      commit(Object.assign({}, current, { status: "idle", remaining: current.duration, endAt: null, pendingReward: 0 }));
      setNotice("");
      playSound("reset");
    }

    function collectReward() {
      const current = sessionRef.current;
      commit(Object.assign({}, current, { status: "idle", remaining: current.duration, endAt: null, pendingReward: 0 }));
      playSound("reward");
    }

    async function sendCoachMessage(text) {
      const message = (text || chatDraft).trim();
      if (!message || chatLoading) return;
      setChatMessages(function (current) {
        return current.concat([{ role: "user", text: message }]).slice(-24);
      });
      setChatDraft("");
      setChatLoading(true);
      playSound("message");

      try {
        const answer = await window.OrbitCloud.coach(message, sessionRef.current, chatMessages);
        setChatMessages(function (current) {
          return current.concat([{ role: "assistant", text: answer }]).slice(-24);
        });
      } catch (error) {
        console.error("Gemini coach request failed; using local coach.", error);
        const fallback = window.OrbitCoach.reply(message, sessionRef.current);
        setChatMessages(function (current) {
          return current.concat([{
            role: "assistant",
            text: fallback + " (Gemini isn’t connected right now, so I used a local reply.)"
          }]).slice(-24);
        });
      } finally {
        setChatLoading(false);
      }
    }

    const statusText = session.status === "running" ? "In your focus flow"
      : session.status === "paused" ? "Taking a breather"
      : session.status === "completed" ? "Session complete" : "Ready when you are";
    const timerMessage = notice || (session.status === "running" ? "One thing at a time. You’re doing great."
      : session.status === "paused" ? "Your progress is saved. Resume when you’re ready."
      : session.status === "completed" ? "You showed up for yourself. That’s the win."
      : "Small steps. Serious momentum.");
    const pageTitle = NAV_ITEMS.find(function (item) { return item.id === page; });
    const timerProps = {
      session: session,
      remaining: remaining,
      progress: progress,
      statusText: statusText,
      message: timerMessage,
      active: active,
      onStart: startOrPause,
      onReset: resetSession
    };
    const durationProps = {
      session: session,
      active: active,
      hours: hours,
      minutes: minutes,
      setHours: setHours,
      setMinutes: setMinutes,
      onChoose: chooseDuration,
      onCustom: setCustomDuration,
      notice: notice
    };

    let pageContent;
    if (page === "focus") {
      pageContent = h(FocusPage, Object.assign({}, timerProps, durationProps, { onNavigate: navigate }));
    } else if (page === "rewards") {
      pageContent = h(RewardsPage, { session: session });
    } else if (page === "leaderboard") {
      pageContent = h(LeaderboardPage, {
        configured: window.OrbitCloud.configured,
        entries: leaderboardEntries,
        error: leaderboardError,
        loading: leaderboardLoading,
        name: leaderboardName,
        notice: leaderboardNotice,
        profile: leaderboardProfile,
        friends: friends,
        friendCode: friendCode,
        setFriendCode: setFriendCode,
        friendError: friendError,
        friendNotice: friendNotice,
        setName: setLeaderboardName,
        onJoin: joinLeaderboard,
        onLeave: leaveLeaderboard,
        onRefresh: refreshLeaderboard,
        onAddFriend: addFriend,
        onRespondFriend: respondFriendRequest,
        onRemoveFriend: removeFriend,
        onCopyCode: copyFriendCode
      });
    } else if (page === "coach") {
      pageContent = h(CoachPage, { draft: chatDraft, setDraft: setChatDraft, messages: chatMessages, onSend: sendCoachMessage, loading: chatLoading });
    } else if (page === "appearance") {
      pageContent = h(AppearancePage, { theme: theme, onChange: changeTheme, mode: mode, onModeChange: changeMode });
    } else {
      pageContent = h(OverviewPage, { session: session, remaining: remaining, onNavigate: navigate });
    }

    return h(React.Fragment, null,
      h("div", { className: "app-layout", "data-theme": theme },
        h(Sidebar, { page: page, onNavigate: navigate }),
        h("div", { className: "app-main" },
          h("header", { className: "topbar" },
            h("div", { className: "topbar-context" },
              h("span", { className: "topbar-live" }, h("i"), "YOUR SPACE"),
              h("span", { className: "topbar-separator" }, "/"),
              h("span", { id: "topbarContextName" }, pageTitle ? pageTitle.label : "Overview")),
            h("div", { className: "topbar-right" },
              h("button", {
                className: "sound-toggle" + (soundEnabled ? " enabled" : ""),
                type: "button",
                "aria-label": soundEnabled ? "Turn sound effects off" : "Turn sound effects on",
                "aria-pressed": soundEnabled,
                title: soundEnabled ? "Sound effects on" : "Sound effects off",
                onClick: toggleSound
              }, h(Icon, { name: soundEnabled ? "sound" : "mute" })),
              h("button", {
                className: "mode-toggle",
                type: "button",
                "aria-label": mode === "dark" ? "Switch to light mode" : "Switch to dark mode",
                title: mode === "dark" ? "Switch to light mode" : "Switch to dark mode",
                onClick: function () { changeMode(mode === "dark" ? "light" : "dark"); }
              }, h(Icon, { name: mode === "dark" ? "sun" : "moon" })),
              h("div", { className: "top-credit", "aria-label": session.credits.toLocaleString() + " available credits" },
                h("span", { className: "credit-gem" }, h(Icon, { name: "spark" })),
                h("span", { className: "top-credit-value" }, session.credits.toLocaleString()),
                h("span", { className: "top-credit-label" }, "credits")),
              h("span", { className: "user-avatar", "aria-label": "Focus member" }, "F"))),
          h("main", { className: "page-content" }, pageContent),
          h("footer", { className: "page-footer" },
            h("span", { className: "footer-spark" }, "✦"), " SHOW UP FOR YOURSELF. THE REST WILL FOLLOW. ",
            h("a", { href: "promo.html", target: "_blank", rel: "noopener noreferrer" }, "Watch the Orbit promo")))),
      session.status === "completed" && session.pendingReward > 0
        ? h("div", { className: "completion-backdrop", role: "presentation" },
            h("section", { className: "completion-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "completionTitle" },
              h("div", { className: "completion-aura" }),
              h("div", { className: "completion-badge" }, h(Icon, { name: "spark" })),
              h("div", { className: "completion-eyebrow" }, "SESSION COMPLETE"),
              h("h2", { id: "completionTitle" }, "That was a power move."),
              h("p", null, "You made the time, found your focus, and your Orbit card just got a little shinier."),
              h("div", { className: "reward-earned" },
                h("span", { className: "reward-earned-gem" }, h(Icon, { name: "spark" })),
                h("strong", null, "+" + session.pendingReward.toLocaleString()),
                h("span", null, "credits added")),
              h("button", { className: "button button-start collect-button", id: "collectReward", type: "button", onClick: collectReward },
                "Collect your credits", h("span", null, "→")))
          )
        : null);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
}());
