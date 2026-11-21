(function (root, createCoach) {
  const coach = createCoach();
  if (typeof module !== "undefined" && module.exports) module.exports = coach;
  if (root) root.OrbitCoach = coach;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const INTENTS = [
    { name: "greeting", pattern: /\b(hi|hello|hey|good morning|good afternoon)\b/i },
    { name: "overwhelm", pattern: /\b(overwhelmed|too much|stressed|stress|anxious|anxiety|swamped|can't cope)\b/i },
    { name: "wellbeing", pattern: /\b(tired|exhausted|burned out|burnout|low energy|need a break)\b/i },
    { name: "procrastination", pattern: /\b(procrastinat\w*|putting off|can't start|cannot start|avoid\w*|get started|getting started|started|start)\b/i },
    { name: "time", pattern: /\b(how long|minutes|duration|timer|time should|session length)\b/i },
    { name: "distraction", pattern: /\b(distract\w*|phone|social media|focus|concentrat\w*)\b/i },
    { name: "study", pattern: /\b(study|studying|exam|revision|homework|learn\w*)\b/i },
    { name: "break", pattern: /\b(break|rest|stretch|walk|step away)\b/i },
    { name: "progress", pattern: /\b(progress|streak|sessions|history|how am i doing)\b/i },
    { name: "rewards", pattern: /\b(credit|reward|earn|balance|points)\b/i },
    { name: "planning", pattern: /\b(plan|planning|schedule|priorit\w*|next step|work on)\b/i },
    { name: "motivation", pattern: /\b(motivat\w*|encourage|confidence|give up|hard day)\b/i }
  ];

  function classifyIntent(text) {
    const message = String(text || "").trim();
    const match = INTENTS.find(function (intent) { return intent.pattern.test(message); });
    return match ? match.name : "general";
  }

  function durationInMinutes(session) {
    const duration = Number(session && session.duration);
    return Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration / 60000)) : 25;
  }

  function formatDuration(minutes) {
    if (minutes < 60) return minutes + (minutes === 1 ? " minute" : " minutes");
    const hours = Math.floor(minutes / 60);
    const leftover = minutes % 60;
    return hours + (hours === 1 ? " hour" : " hours") + (leftover ? " " + leftover + " min" : "");
  }

  function reply(text, session) {
    const message = String(text || "").trim();
    const current = session && typeof session === "object" ? session : {};
    const minutes = durationInMinutes(current);
    const intent = classifyIntent(message);

    if (!message) return "Tell me what you’re working on, and we’ll find one small next step.";
    if (intent === "greeting") {
      return "Hey! What would make this session feel like a win? I can help you plan, get unstuck, or choose a focus length.";
    }
    if (intent === "overwhelm") {
      return "Let’s make the list smaller. Write down everything competing for your attention, circle just one item, then work on its first tiny action for 10 minutes.";
    }
    if (intent === "wellbeing") {
      return "Low energy is useful information, not a failure. Try a gentle 10-minute session, then take a real 5-minute screen-free break and see how you feel.";
    }
    if (intent === "procrastination") {
      return "Make the start almost too easy: open the right page, write one rough sentence, or gather one tool. Set 10 minutes and give yourself permission to stop when it ends.";
    }
    if (intent === "distraction") {
      return "Try a quick reset: silence one notification, move your phone out of reach, and keep a note nearby for thoughts that can wait. Then pick one task for the next 25 minutes.";
    }
    if (intent === "study") {
      return "Try one 25-minute study block: choose a single topic, recall what you know without looking, then check your notes and mark one gap to revisit. Take a short break afterward.";
    }
    if (intent === "break") {
      return "A good reset can be simple: stand up, look away from the screen, stretch, and get some water for five minutes. You can resume your timer when you’re ready.";
    }
    if (intent === "progress") {
      const completed = Number(current.completedSessions) || 0;
      const credits = Number(current.credits) || 0;
      return completed
        ? "You’ve completed " + completed + " focus " + (completed === 1 ? "session" : "sessions") + " and collected " + credits.toLocaleString() + " credits. That progress counts—what would you like to tackle next?"
        : "Your progress starts with showing up once. Finish your first focus session and I’ll have a session count and credits to celebrate with you.";
    }
    if (intent === "rewards") {
      const credits = Number(current.credits) || 0;
      return "A completed session earns 10 credits per focused minute. Your current balance is " + credits.toLocaleString() + " credits; you can see your history on the Rewards page.";
    }
    if (intent === "time") {
      if (current.status === "running") return "You’re already in a " + formatDuration(minutes) + " focus session. Keep the next step small and let the timer hold the boundary.";
      if (current.status === "paused") return "You have " + formatDuration(minutes) + " set for this session. Resume when you’re ready, or choose a shorter sprint if that feels better.";
      return "A 25-minute sprint is a friendly default. Try 10 minutes if you’re low on energy, or 50 minutes if you’re settled into deeper work.";
    }
    if (intent === "planning") {
      if (current.status === "running") return "Your " + formatDuration(minutes) + " session is underway. Name one outcome, split it into a first action, and work on only that until the timer ends.";
      return "Try this three-step plan: name one outcome, choose its smallest visible action, then focus for 25 minutes. Leave a note about where to resume before you take a break.";
    }
    if (intent === "motivation") {
      return "You don’t need to feel ready to begin. Choose one task, do the first two minutes, and let momentum—not motivation—carry you into the next step.";
    }
    return "I’m here to help you make this manageable. What’s the one thing you need to finish, and what is the smallest action you could take next?";
  }

  return { classifyIntent: classifyIntent, reply: reply };
}));
