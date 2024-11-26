const express = require('express')
const httpProxy = require('http-proxy')
const dotenv = require('dotenv')
dotenv.config();
const app = express();
const PORT = 8000;
const BASE_PATH = process.env.BASE_PATH;

const proxy = httpProxy.createProxy()

app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    const resolvesTo = `${BASE_PATH}/${subdomain}`

    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true })
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'
})

app.get('/health', (req, res) => {
  return res.json({ health: "ok" });
})

app.listen(PORT, () => console.log(`Reverse Proxy Running..${PORT}`))

const https = require("https");
setInterval(() => {
  const healthCheckUrl = `https://localhost:${PORT}/health`;
  http
    .get(healthCheckUrl, (resp) => {
      let data = "";
      resp.on("data", (chunk) => {
        data += chunk;
      });
      resp.on("end", () => {
        console.log("Health check response:", data);
      });
    })
    .on("error", (err) => {
      console.error("Health check failed:", err.message);
    });
}, 14 * 60 * 1000); // 14 minutes in milliseconds