const express = require('express');
const httpProxy = require('http-proxy');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const BASE_PATH = process.env.BASE_PATH;
const proxy = httpProxy.createProxy();

// Explicitly parse hostname
app.set('trust proxy', true);

// Logging middleware for debugging
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

app.use((req, res) => {
    try {
        const hostname = req.get('host') || req.hostname;
        const subdomain = hostname.split('.')[0];
        const resolvesTo = `${BASE_PATH}/${subdomain}`;

        console.log(`Proxying to: ${resolvesTo}`);

        proxy.web(req, res, { 
            target: resolvesTo, 
            changeOrigin: true,
            autoRewrite: true,
            selfHandleResponse: true 
        }, (err) => {
            console.error('Proxy Error:', err);
            res.status(404).send('Service not found');
        });
    } catch (error) {
        console.error('Request handling error:', error);
        res.status(500).send('Internal Server Error');
    }
});

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    
    if (url === '/' || !url.includes('.')) {
        proxyReq.path = '/index.html';
    }
});

app.get('/health', (req, res) => {
    return res.json({ 
        health: "ok", 
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Create HTTP server with explicit binding
const server = http.createServer(app);

// Listen with explicit error handling
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Reverse Proxy Running on port ${PORT}`);
    console.log(`Listening on 0.0.0.0:${PORT}`);
});

// Error handling for server
server.on('error', (error) => {
    console.error('Server Error:', error);
    if (error.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use`);
    }
});

// Health check function
const healthCheck = () => {
    const healthCheckUrl = `http://localhost:${PORT}/health`;
    
    http.get(healthCheckUrl, (resp) => {
        let data = "";
        resp.on("data", (chunk) => {
            data += chunk;
        });
        resp.on("end", () => {
            console.log("Health check response:", data);
        });
    }).on("error", (err) => {
        console.error("Health check failed:", err.message);
    });
};

// Run health check every 14 minutes
const healthCheckInterval = setInterval(healthCheck, 14 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    clearInterval(healthCheckInterval);
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Catch any unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});