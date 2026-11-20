import type { Request, Response } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import {
  CreatePdfMaterialFieldsSchema,
  CreateTextMaterialSchema,
  MaterialIdParamsSchema,
} from './materials.schema.js';
import type { MaterialsService } from './materials.service.js';

export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  createText = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: CreateTextMaterialSchema });
    const result = await this.service.createFromText(getAuth(res).userId, body);
    res.status(201).json(result);
  };

  createPdf = async (req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: CreatePdfMaterialFieldsSchema });
    if (!req.file) throw new BadRequestError('File PDF wajib dikirim di field "file"');
    const result = await this.service.createFromPdf(getAuth(res).userId, body, {
      buffer: req.file.buffer,
      size: req.file.size,
    });
    res.status(201).json(result);
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json({ materials: await this.service.list(getAuth(res).userId) });
  };

  get = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: MaterialIdParamsSchema });
    res.json({ material: await this.service.get(getAuth(res).userId, params.id) });
  };

  fileUrl = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: MaterialIdParamsSchema });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await this.service.getFileUrl(getAuth(res).userId, params.id));
  };

  delete = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: MaterialIdParamsSchema });
    await this.service.delete(getAuth(res).userId, params.id);
    res.status(204).end();
  };
}
