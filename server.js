const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, ".env.local"));

const azureKey = process.env.AZURE_SPEECH_KEY;
const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";

const personaVoices = {
  strictHr: "zh-CN-XiaoxiaoNeural",
  techBro: "zh-CN-YunxiNeural",
  gentleSister: "zh-CN-XiaoyiNeural",
};

const azureVoiceOptions = [
  { value: "auto", label: "按人设自动选择" },
  { value: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao 女声，清晰自然" },
  { value: "zh-CN-XiaoyiNeural", label: "Xiaoyi 女声，年轻友好" },
  { value: "zh-CN-YunxiNeural", label: "Yunxi 男声，年轻自然" },
  { value: "zh-CN-YunyangNeural", label: "Yunyang 男声，播报感" },
  { value: "zh-CN-YunjianNeural", label: "Yunjian 男声，成熟稳重" },
  { value: "zh-CN-YunhaoNeural", label: "Yunhao 男声，深沉有力" },
];

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toPercent(value, baseline = 1, min = -50, max = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "+0%";
  const raw = Math.round((numeric - baseline) * 100);
  const clamped = Math.max(min, Math.min(max, raw));
  return `${clamped >= 0 ? "+" : ""}${clamped}%`;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/tts-demo/";
  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = path.resolve(rootDir, `.${pathname}`);
  if (!filePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

async function handleAzureStatus(_request, response) {
  sendJson(response, 200, {
    configured: Boolean(azureKey && azureKey !== "replace_with_your_azure_speech_key"),
    region: azureRegion,
    voices: azureVoiceOptions,
  });
}

async function handleTts(request, response) {
  if (!azureKey || azureKey === "replace_with_your_azure_speech_key") {
    sendJson(response, 500, { error: "Azure Speech key is not configured." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(request));
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body." });
    return;
  }

  const text = String(payload.text || "").trim();
  if (!text) {
    sendJson(response, 400, { error: "Text is required." });
    return;
  }

  const persona = payload.persona || "strictHr";
  const requestedVoice = payload.voice === "auto" ? "" : String(payload.voice || "");
  const voice = requestedVoice || personaVoices[persona] || personaVoices.strictHr;
  const rate = toPercent(payload.rate, 1, -45, 45);
  const pitch = toPercent(payload.pitch, 1, -50, 50);

  const ssml = `
<speak version="1.0" xml:lang="zh-CN" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${escapeXml(voice)}">
    <prosody rate="${rate}" pitch="${pitch}">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

  const endpoint = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azureKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "facewall-tts-demo",
      },
      body: ssml,
    });

    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      sendJson(response, azureResponse.status, {
        error: "Azure TTS request failed.",
        detail: errorText.slice(0, 500),
      });
      return;
    }

    const audio = Buffer.from(await azureResponse.arrayBuffer());
    response.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": audio.length,
      "Cache-Control": "no-store",
      "X-Azure-Voice": voice,
    });
    response.end(audio);
  } catch (error) {
    sendJson(response, 502, {
      error: "Failed to reach Azure TTS.",
      detail: error.message,
    });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/azure-status") {
    await handleAzureStatus(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tts") {
    await handleTts(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  sendText(response, 405, "Method not allowed");
});

server.listen(port, () => {
  console.log(`TTS demo running at http://localhost:${port}/tts-demo/`);
  console.log(`Azure Speech region: ${azureRegion}`);
  console.log(`Azure Speech key configured: ${Boolean(azureKey && azureKey !== "replace_with_your_azure_speech_key")}`);
});
