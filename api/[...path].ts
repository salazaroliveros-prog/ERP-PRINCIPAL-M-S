import { createApp } from '../server.js';

type AppHandler = (req: any, res: any) => any;

let cachedApp: AppHandler | null = null;
let appInitPromise: Promise<AppHandler> | null = null;

async function getApp() {
  if (cachedApp) {
    return cachedApp;
  }

  if (!appInitPromise) {
    appInitPromise = createApp({ includeFrontend: false })
      .then((app) => {
        cachedApp = app as AppHandler;
        return cachedApp;
      })
      .catch((error) => {
        appInitPromise = null;
        throw error;
      });
  }

  return appInitPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error('API handler bootstrap failure:', error);
    return res.status(500).json({
      error: 'API bootstrap failed',
      message: error?.message || 'Unknown server error',
    });
  }
}
