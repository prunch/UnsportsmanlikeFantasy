import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import leaguesRouter from './routes/leagues';
import adminRouter from './routes/admin';
import rankingsRouter from './routes/rankings';
import cardsRouter from './routes/cards';
import chatRouter from './routes/chat';
import notificationsRouter from './routes/notifications';
import scoreboardRouter from './routes/scoreboard';
import commissionerRouter from './routes/commissioner';
import healthRouter from './routes/health';
import debugRouter from './routes/debug'; // DEBUG-ONLY: REMOVE FOR PROD

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api', cardsRouter);
app.use('/api/leagues', chatRouter);
app.use('/api/leagues', scoreboardRouter);
app.use('/api/leagues', commissionerRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/rankings', rankingsRouter);

// DEBUG-ONLY: REMOVE FOR PROD
if (process.env.DEBUG_DRAFT === 'true') {
  app.use('/api/debug', debugRouter);
  logger.info('🐛 Debug draft routes enabled at /api/debug');
}

// Error handling
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🏈 Gridiron Cards API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
