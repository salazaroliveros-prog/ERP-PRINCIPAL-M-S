import { createApp } from '../server';

let cachedAppPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: any, res: any) {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp({ includeFrontend: false });
  }

  const app = await cachedAppPromise;
  return app(req, res);
}
