import type { Request, Response } from 'express';
import { getAuth } from '../../common/middlewares/auth.middleware.js';
import { getValidated } from '../../common/middlewares/validate.middleware.js';
import {
  ClassIdParamsSchema,
  ClassMemberParamsSchema,
  CreateClassSchema,
  JoinClassSchema,
  RenameClassSchema,
} from './classes.schema.js';
import type { ClassesService } from './classes.service.js';

export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  create = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: CreateClassSchema });
    res.status(201).json({ class: await this.service.create(getAuth(res).userId, body.name) });
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json({ classes: await this.service.list(getAuth(res)) });
  };

  get = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassIdParamsSchema });
    res.json({ class: await this.service.get(getAuth(res).userId, params.id) });
  };

  rename = async (_req: Request, res: Response): Promise<void> => {
    const { params, body } = getValidated(res, { params: ClassIdParamsSchema, body: RenameClassSchema });
    res.json({ class: await this.service.rename(getAuth(res).userId, params.id, body.name) });
  };

  rotateCode = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassIdParamsSchema });
    res.json({ class: await this.service.rotateCode(getAuth(res).userId, params.id) });
  };

  delete = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassIdParamsSchema });
    await this.service.delete(getAuth(res).userId, params.id);
    res.status(204).end();
  };

  join = async (_req: Request, res: Response): Promise<void> => {
    const { body } = getValidated(res, { body: JoinClassSchema });
    res.json({ class: await this.service.join(getAuth(res).userId, body.classCode) });
  };

  listMembers = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassIdParamsSchema });
    res.json({ members: await this.service.listMembers(getAuth(res).userId, params.id) });
  };

  removeMember = async (_req: Request, res: Response): Promise<void> => {
    const { params } = getValidated(res, { params: ClassMemberParamsSchema });
    await this.service.removeMember(getAuth(res).userId, params.id, params.studentId);
    res.status(204).end();
  };
}
