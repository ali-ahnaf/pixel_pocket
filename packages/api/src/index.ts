import 'reflect-metadata';
import './env';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { AppDataSource } from './data-source';
import authRouter from './routes/auth.routes';
import usersRouter from './routes/users.routes';
import transactionsRouter from './routes/transactions.routes';
import analyticsRouter from './routes/analytics.routes';
import vaultsRouter from './routes/vaults.routes';
import tagsRouter from './routes/tags.routes';
import adventureRouter from './routes/adventure.route'
import recurringRouter from './routes/recurring.routes';
import debtsRouter from './routes/debts.routes';
import preferencesRouter from './routes/preferences.routes';
import BackupRouter from './routes/backup.routes';
import oauthCredentialsRouter from './routes/oauth-credentials.routes';
import vaultWatchersRouter from './routes/vault-watchers.routes';
import pushSubscriptionsRouter from './routes/push-subscriptions.routes';
import oauthRouter from './routes/oauth.routes';
import aiCredentialsRouter from './routes/ai-credentials.routes';
import pendingExpensesRouter from './routes/pending-expenses.routes';
import { authenticate, requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { restoreAllRecurringJobs } from './scheduler/recurring-scheduler';
import { startBackupScheduler } from './scheduler/backup-scheduler';
import { startGmailWatchScheduler, renewExpiringGmailWatches } from './scheduler/gmail-watch-scheduler';
import { logger } from './services/logger.service';
import adventureItemsRoute from './routes/adventureItems.route';
const app = express();
const PORT = process.env.PORT || 4000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(
  cors({
    origin: isDev ? true : process.env.ALLOWED_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(authenticate);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);

app.use('/api/users', requireAuth, usersRouter);
app.use('/api/users/:userId/transactions', requireAuth, transactionsRouter);
app.use('/api/users/:userId/analytics', requireAuth, analyticsRouter);
app.use('/api/users/:userId/vaults', requireAuth, vaultsRouter);
app.use('/api/users/:userId/tags', requireAuth, tagsRouter);
app.use('/api/users/:userId/recurring', requireAuth, recurringRouter);
app.use('/api/users/:userId/debts', requireAuth, debtsRouter);
app.use('/api/users/:userId/preferences', requireAuth, preferencesRouter);
app.use('/api/users/:userId/backup', requireAuth, BackupRouter);
app.use('/api/users/:userId/oauth-credentials', requireAuth, oauthCredentialsRouter);
app.use('/api/users/:userId/vault-watchers', requireAuth, vaultWatchersRouter);
app.use('/api/users/:userId/push-subscriptions', requireAuth, pushSubscriptionsRouter);
app.use('/api/users/:userId/ai-credentials', requireAuth, aiCredentialsRouter);
app.use('/api/users/:userId/pending-expenses', requireAuth, pendingExpensesRouter);
app.use('/api/users/:userId/adventures' ,requireAuth,adventureRouter)
app.use('/api/users/:userId/adventures/:adventureId/items', requireAuth, adventureItemsRoute);

// Public Google OAuth callback — no requireAuth; the user id rides in a signed state.
app.use('/api/oauth', oauthRouter);


// Serve static files from the Next.js build
const uiDir = path.join(__dirname, '../../ui/out');
if (fs.existsSync(uiDir)) {
  app.use(express.static(uiDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDir, 'index.html'));
  });
}

app.use(errorHandler); // global error handler — must be last

// Database connection and server startup
AppDataSource.initialize()
  .then(async () => {
    logger.info('Database connected');
    try {
      await restoreAllRecurringJobs();
    } catch (err) {
      logger.error('Failed to restore recurring jobs:', err);
    }
    try {
      await renewExpiringGmailWatches();
    } catch (err) {
      logger.error('Failed to renew Gmail watches on boot:', err);
    }
    startGmailWatchScheduler();
    startBackupScheduler();
    app.listen(PORT, () => {
      logger.info(`Node env: ${process.env.NODE_ENV}`);
      logger.info(`API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logger.error('Database connection failed during initialization:', err);
    process.exit(1);
  });
