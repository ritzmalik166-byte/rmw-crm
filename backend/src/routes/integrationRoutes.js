import { Router } from 'express';
import { integrationController as c } from '../controllers/integrationController.js';
import { limiters } from '../middleware/security.js';
import { asyncHandler as h } from '../utils/http.js';

/** Machine-to-machine lead ingestion. Authenticated by per-website API key (+ optional HMAC); no cookies. */
const r = Router();
r.use(limiters.integration);
r.post('/leads', h(c.receive));
r.post('/:website(mpf|rmw|ct)/leads', h(c.receive));
r.post('/:website(mpf|rmw|ct)/leads/batch', h(c.receiveBatch));
export default r;
