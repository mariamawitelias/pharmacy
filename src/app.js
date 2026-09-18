require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const ApiError = require('./utils/ApiError');
const { auth } = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());
app.use(auth);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================
// Router mounting
// =============================================================
// TODO(Person 1): mount authRouter, userRouter, prescriptionRouter, orderRouter
// TODO(Person 2): mount pharmacyRouter, inventoryRouter

const questionsRouter = require('./routes/questions');
const notificationsRouter = require('./routes/notifications');
app.use('/api/questions', questionsRouter);
app.use('/api/notifications', notificationsRouter);

// =============================================================
// 404 + global error handler
// =============================================================
app.use((req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `We couldn't find ${req.originalUrl}.`));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.isOperational
    ? err.message
    : 'Something went wrong on our end. Please try again in a moment, or ask someone to call support.';
  res.status(statusCode).json({
    error: { code, message },
    ...(process.env.NODE_ENV === 'development' && !err.isOperational && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Medireach listening on port ${PORT}`);
  });
}

module.exports = { app, prisma };
