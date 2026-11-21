import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class OrbitHandler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != "/api/coach":
            self.send_json(404, {"error": "Not found"})
            return

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            self.send_json(503, {
                "error": "Gemini is not configured",
                "hint": "Set the GEMINI_API_KEY environment variable before starting the server."
            })
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length > 100_000:
                self.send_json(413, {"error": "Request is too large"})
                return
            request = json.loads(self.rfile.read(content_length).decode("utf-8"))
            message = str(request.get("message", "")).strip()
            session = request.get("session", {}) if isinstance(request.get("session"), dict) else {}
            history = request.get("history", []) if isinstance(request.get("history"), list) else []
            if not message:
                self.send_json(400, {"error": "A message is required"})
                return

            history_text = "\n".join(
                "{}: {}".format(item.get("role", "user"), str(item.get("text", "")))
                for item in history[-10:]
                if isinstance(item, dict)
            )
            prompt = (
                "You are Orbit, a calm and practical focus coach. "
                "Give concise, encouraging, actionable guidance for study and focus. "
                "Do not claim medical expertise. Keep replies under 150 words.\n"
                "Current session context: status={status}; duration_minutes={duration}; "
                "remaining_minutes={remaining}; completed_sessions={completed}; credits={credits}.\n"
                "{history}\nUser: {message}"
            ).format(
                status=session.get("status", "idle"),
                duration=max(1, round(float(session.get("duration", 25 * 60 * 1000)) / 60000)),
                remaining=max(0, round(float(session.get("remaining", 0)) / 60000)),
                completed=session.get("completedSessions", 0),
                credits=session.get("credits", 0),
                history=("Recent conversation:\n" + history_text) if history_text else "",
                message=message,
            )

            model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip()
            url = "https://generativelanguage.googleapis.com/v1beta/models/{}/:generateContent".format(
                urllib.parse.quote(model, safe="")
            )
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 300},
            }
            api_request = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                method="POST",
            )
            with urllib.request.urlopen(api_request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))

            candidates = result.get("candidates") or []
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
            text = "".join(str(part.get("text", "")) for part in parts).strip()
            if not text:
                self.send_json(502, {"error": "Gemini returned an empty response"})
                return
            self.send_json(200, {"text": text})
        except urllib.error.HTTPError as error:
            try:
                details = json.loads(error.read().decode("utf-8"))
                message = details.get("error", {}).get("message", "Gemini request failed")
            except Exception:
                message = "Gemini request failed"
            self.send_json(502, {"error": message})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid JSON request"})
        except Exception as error:
            self.send_json(502, {"error": "Could not reach Gemini", "details": str(error)})


def main():
    parser = argparse.ArgumentParser(description="Run the Orbit Focus web app locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Interface to bind to (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to serve on (default: 8000)")
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent
    handler = partial(OrbitHandler, directory=str(project_dir))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print("Orbit Focus is running at http://{}:{}/".format(args.host, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Orbit Focus server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
