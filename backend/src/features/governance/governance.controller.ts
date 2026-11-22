import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import type { CohortService } from './cohort.service.js';
import {
  ClassIdParamsSchema,
  ClassMaterialParamsSchema,
  LedgerExportSchema,
  LedgerHashParamsSchema,
  LedgerQuerySchema,
} from './governance.schema.js';
import type { GovernanceService } from './governance.service.js';
import type { LedgerExportService } from './ledgerExport.service.js';

export class GovernanceController {
  constructor(
    private readonly service: GovernanceService,
    private readonly exports?: LedgerExportService,
    private readonly cohort?: CohortService,
  ) {}

  cohortMaterials = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassIdParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.json({ materials: await this.cohort!.materials(getAuth(res).userId, params.classId) });
  };

  cohortBlindSpots = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassMaterialParamsSchema });
    res.set('Cache-Control', 'no-store');
    res.json(await this.cohort!.blindSpots(getAuth(res).userId, params.classId, params.materialId));
  };

  exportPdf = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: LedgerExportSchema });
    res.status(201).json({ export: await this.exports!.create(getAuth(res).userId, body) });
  };

  ledger = async (_req: Request, res: Response): Promise<void> => {
    const { params, query } = getValidated(res, { params: ClassIdParamsSchema, query: LedgerQuerySchema });
    res.set('Cache-Control', 'no-store');
    res.json(await this.service.ledger(getAuth(res).userId, params.classId, query));
  };

  verify = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: LedgerHashParamsSchema });
    res.json(await this.service.verify(params.hash));
  };
}
