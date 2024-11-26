const express = require('express');
const httpProxy = require('http-proxy');
const dotenv = require('dotenv');
const https = require('https');
const http = require('http');
const path = require('path');

dotenv.config();

const app = express();
const PORT = 8000;
const BASE_PATH = process.env.BASE_PATH;
const proxy = httpProxy.createProxy()

app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    const resolvesTo = `${BASE_PATH}/${subdomain}`;

    // Enhanced route handling
    proxy.web(req, res, { 
        target: resolvesTo, 
        changeOrigin: true,
        autoRewrite: true,
        selfHandleResponse: true 
    }, (err) => {
        if (err) {
            console.error('Proxy Error:', err);
            
            // Try to serve index.html for all routes
            try {
                res.sendFile(path.join(resolvesTo, 'index.html'));
            } catch (sendFileErr) {
                console.error('Failed to serve index.html:', sendFileErr);
                res.status(500).json({ 
                    error: 'Unable to route request', 
                    details: err.message 
                });
            }
        }
    });
});
proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/' || !url.includes('.')) {
        proxyReq.path = '/index.html';
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    return res.json({ 
        health: "ok", 
        timestamp: new Date().toISOString() 
    });
});

// Comprehensive error handling
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`Reverse Proxy Running on port ${PORT}`);
});

// Health check interval
const healthCheck = () => {
    const healthCheckUrl = `https://s3-reverse-proxy-bc0j.onrender.com/health`;
    
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
        
        // Optional: Restart server or take recovery action
        if (err.code === 'ECONNREFUSED') {
            console.log('Attempting to restart server...');
            server.close();
            server.listen(PORT);
        }
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