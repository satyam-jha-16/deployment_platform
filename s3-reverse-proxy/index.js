const express = require('express')
const httpProxy = require('http-proxy')
const dotenv = require('dotenv')
const url = require('url')
const http = require('http')
const https = require('https')

// Load environment variables
dotenv.config();

const app = express()
const PORT = process.env.PORT || 8000
const BASE_PATH = process.env.BASE_PATH ;

// Configure proxy with SSL options
const proxy = httpProxy.createProxy({
    changeOrigin: true,
    secure: false,  // Disable SSL verification
    followRedirects: true,
    // Add SSL configuration
    ssl: {
        rejectUnauthorized: false  // Only for development, be cautious in production
    }
});

// Middleware to force HTTPS if needed
app.use((req, res, next) => {
    // Check if connection is not secure and force HTTPS
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.hostname}${req.originalUrl}`);
    }
    next();
});

// Logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        url: req.url,
        headers: {
            host: req.get('host'),
            'x-forwarded-proto': req.headers['x-forwarded-proto']
        }
    });
    next();
});

// Proxy middleware
app.use((req, res) => {
    try {
        // Determine hostname, prioritizing x-forwarded-host
        const hostname = req.headers['x-forwarded-host'] || req.get('host') || req.hostname || 'localhost';
        
        // Safely extract subdomain
        const subdomain = hostname ? hostname.split('.')[0] : 'default';
        
        // Construct target URL
        const targetUrl = `${BASE_PATH}/${subdomain}`;
        
        console.log(`Proxying to: ${targetUrl}`);
        
        // Parse the target URL
        const parsedUrl = url.parse(targetUrl);
        
        // Configure proxy options
        const proxyOptions = {
            target: targetUrl,
            changeOrigin: true,
            secure: false,  // Important for self-signed or invalid SSL certs
            autoRewrite: true,
            protocolRewrite: 'https',
            cookieDomainRewrite: {
                "*": ""  // Rewrite cookie domains
            },
            followRedirects: true,
            xfwd: true,  // Add x-forwarded headers
        };
        
        // Proxy the web request
        proxy.web(req, res, proxyOptions, (err) => {
            console.error('Proxy Error:', err);
            res.status(500).json({
                error: 'Proxy failed',
                message: err ? err.message : 'Unknown proxy error'
            });
        });
    } catch (error) {
        console.error('Request handling error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// Enhanced proxy request handler
proxy.on('proxyReq', (proxyReq, req, res) => {
    // Add original host and protocol headers
    proxyReq.setHeader('X-Original-Host', req.get('host'));
    proxyReq.setHeader('X-Forwarded-Proto', 'https');
    
    // Modify path for root route
    if (req.url === '/') {
        proxyReq.path += 'index.html';
    }
});

// Proxy error handling
proxy.on('error', (err, req, res) => {
    console.error('Unhandled proxy error:', err);
    
    // Try to send an error response
    try {
        res.writeHead(500, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({
            error: 'Proxy Server Error',
            message: err.message
        }));
    } catch (responseErr) {
        console.error('Failed to send error response:', responseErr);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        basePath: BASE_PATH,
        protocol: req.protocol,
        forwardedProto: req.headers['x-forwarded-proto']
    });
});

// Catch-all error handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// Create HTTP server
const server = http.createServer(app);

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Reverse Proxy Running on port ${PORT}`);
    console.log(`Base Path: ${BASE_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});