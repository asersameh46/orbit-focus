const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "Gemini is not configured on the server." }, { status: 503, headers: corsHeaders });
  }

  try {
    const requestBody = await request.json();
    const message = typeof requestBody.message === "string" ? requestBody.message.trim() : "";
    if (!message || message.length > 500) {
      return Response.json({ error: "Message must contain 1-500 characters." }, { status: 400, headers: corsHeaders });
    }

    const session = requestBody.session && typeof requestBody.session === "object" ? requestBody.session : {};
    const history = Array.isArray(requestBody.history) ? requestBody.history.slice(-10) : [];
    const contents = history
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: { role?: string; text?: string }) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: String(item.text || "").slice(0, 1000) }]
      }))
      .filter((item: { parts: { text: string }[] }) => item.parts[0].text.length > 0);

    contents.push({
      role: "user",
      parts: [{
        text: [
          "You are Orbit, a calm, practical focus coach. Give concise, encouraging, actionable study and focus guidance. Do not claim medical expertise. Keep replies under 150 words.",
          "Current focus session: status=" + String(session.status || "idle").slice(0, 20) +
            ", duration_ms=" + String(session.duration || 0).slice(0, 16) +
            ", remaining_ms=" + String(session.remaining || 0).slice(0, 16) +
            ", completed_sessions=" + String(session.completedSessions || 0).slice(0, 10) +
            ", credits=" + String(session.credits || 0).slice(0, 16) + ".",
          message
        ].join("\n")
      }]
    });

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      }
    );
    const result = await response.json();
    if (!response.ok) {
      return Response.json(
        { error: result.error?.message || "Gemini request failed." },
        { status: 502, headers: corsHeaders }
      );
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      return Response.json({ error: "Gemini returned an empty response." }, { status: 502, headers: corsHeaders });
    }
    return Response.json({ text }, { headers: corsHeaders });
  } catch (error) {
    console.error("Coach function failed:", error);
    return Response.json({ error: "The coach could not complete this request." }, { status: 500, headers: corsHeaders });
  }
});
