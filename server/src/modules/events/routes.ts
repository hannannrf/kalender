import { Router } from 'express';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import * as service from './service';

export const router = Router();

router.get('/detected-events', async (req, res) => {
  res.json(await service.listDetected(db(), userIdOf(req)));
});
