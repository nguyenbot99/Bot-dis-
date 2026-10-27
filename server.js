/**
 * Express keep-alive server cho Render free tier.
 * Render sẽ tắt (spin down) web service sau 15 phút nếu không có request.
 * Endpoint /health giữ service thức và cho phép cron job ping định kỳ.
 */

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.get('/', (_req, res) => {
  res.status(200).send('ZiPlayer Music Bot is running.');
});

const server = app.listen(PORT, () => {
  console.log(`[Keep-alive] Express listening on port ${PORT}`);
});

module.exports = { app, server };
