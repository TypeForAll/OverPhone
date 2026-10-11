import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncRoute, AppError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { assignRandomNumber, claimNumber } from '../services/numbers.js';

const router = Router();
router.use(requireAuth);
router.get('/countries', asyncRoute(async (_req, res) => res.json({ countries: await prisma.country.findMany({ select: { id: true, name: true, isoCode: true, callingCode: true, nationalLengths: true, numberPattern: true } }) })));
router.get('/search', asyncRoute(async (req, res) => {
  const query = z.object({ countryId: z.string(), contains: z.string().regex(/^\d{0,12}$/) }).parse(req.query);
  const country = await prisma.country.findUnique({ where: { id: query.countryId } });
  if (!country) throw new AppError(404, 'Country not found');
  const numbers = await prisma.phoneNumber.findMany({ where: { countryId: country.id, userId: null, e164: { contains: query.contains } }, take: 30, select: { e164: true } });
  res.json({ numbers: numbers.map(number => number.e164) });
}));
router.post('/random', asyncRoute(async (req, res) => {
  const body = z.object({ countryId: z.string() }).parse(req.body);
  res.status(201).json({ number: await assignRandomNumber(req.userId!, body.countryId) });
}));
router.post('/claim', asyncRoute(async (req, res) => {
  const body = z.object({ countryId: z.string(), number: z.string() }).parse(req.body);
  res.status(201).json({ number: await claimNumber(req.userId!, body.countryId, body.number) });
}));
export default router;
