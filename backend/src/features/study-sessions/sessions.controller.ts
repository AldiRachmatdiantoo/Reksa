import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import { SessionIdParamsSchema, StartSessionSchema, SubmitJolSchema } from './sessions.schema.js';
import type { SessionsService } from './sessions.service.js';

export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  start = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: StartSessionSchema });
    res.status(201).json({ session: await this.service.start(getAuth(res).userId, body) });
  };

  getActive = async (_req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    res.json({ session: await this.service.getActive(getAuth(res).userId) });
  };

  get = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.json({ session: await this.service.get(getAuth(res).userId, params.id) });
  };

  submitJol = async (_req: Request, res: Response): Promise<void> => {
    const { params, body } = getValidated(res, { params: SessionIdParamsSchema, body: SubmitJolSchema });
    res.json({ session: await this.service.submitJol(getAuth(res).userId, params.id, body.predictedJolScore) });
  };

  issueQrBridge = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.status(201).json(await this.service.issueQrBridge(getAuth(res).userId, params.id));
  };

  /**
   * SSE untuk layar laptop: `ready` saat tersambung, komentar `: ping` tiap 15 detik (menjaga proxy
   * tetap terbuka), lalu `uploaded {submissionId}` atau `timeout`, kemudian koneksi ditutup.
   */
  qrBridgeEvents = async (req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    const userId = getAuth(res).userId;
    // Cek kepemilikan sebelum header SSE dikirim, supaya 404 tetap berupa JSON biasa.
    await this.service.get(userId, params.id);

    const abort = new AbortController();
    req.on('close', () => abort.abort());
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // nginx: matikan buffering untuk respons ini tanpa perlu aturan location khusus.
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 5000\n\n');
    send('ready', { sessionId: params.id });
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);

    try {
      const submissionId = await this.service.waitForQrUpload(userId, params.id, abort.signal);
      if (!abort.signal.aborted) send(submissionId ? 'uploaded' : 'timeout', submissionId ? { submissionId } : {});
    } catch {
      if (!abort.signal.aborted) send('error', { code: 'QR_BRIDGE_UNAVAILABLE' });
    } finally {
      clearInterval(ping);
      res.end();
    }
  };

  cancel = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: SessionIdParamsSchema });
    res.json({ session: await this.service.cancel(getAuth(res).userId, params.id) });
  };
}
