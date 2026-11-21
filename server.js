import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const SERVER = (process.env.SHELLY_SERVER || "https://shelly-170-eu.shelly.cloud").replace(/\/+$/, "");
const DEVICE_ID = process.env.SHELLY_DEVICE_ID;
const AUTH_KEY = process.env.SHELLY_AUTH_KEY;
const TIMEOUT_MS = 8000;

if (!DEVICE_ID || !AUTH_KEY) {
  console.error("Missing required SHELLY_DEVICE_ID or SHELLY_AUTH_KEY environment variables.");
  process.exit(1);
}

async function callShelly(endpointPath, extraParams = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      id: DEVICE_ID,
      auth_key: AUTH_KEY,
      ...extraParams
    });

    const res = await fetch(`${SERVER}${endpointPath}`, {
      method: "POST",
      body,
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok || data.isok === false) {
      throw new Error(data.errors ? JSON.stringify(data.errors) : `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Shelly Cloud request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

app.get("/api/status", async (_req, res) => {
  try {
    const data = await callShelly("/device/status");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/relay", async (req, res) => {
  const turn = req.body?.turn;
  const rawChannel = req.body?.channel ?? "0";
  const channel = String(rawChannel);

  if (!["on", "off"].includes(turn)) {
    return res.status(400).json({ error: "Invalid 'turn' value; expected 'on' or 'off'." });
  }
  if (!/^\d+$/.test(channel)) {
    return res.status(400).json({ error: "Invalid 'channel' value." });
  }

  try {
    const data = await callShelly("/device/relay/control", { channel, turn });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Shelly proxy listening on http://localhost:${PORT}`);
});