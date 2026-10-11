import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncRoute, AppError, routeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizeOverPhoneNumber } from '../services/numbers.js';

const router = Router(); router.use(requireAuth);
const person = { id: true, username: true, displayName: true, avatarUrl: true, number: { select: { e164: true } } } as const;
async function allowed(senderId: string, receiverId: string) { return !(await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: senderId, blockedId: receiverId }, { blockerId: receiverId, blockedId: senderId }] } })); }

router.get('/conversations', asyncRoute(async (req, res) => {
  const conversations = await prisma.conversation.findMany({ where: { members: { some: { userId: req.userId } } }, include: { members: { include: { user: { select: person } } }, messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
  res.json({ conversations });
}));
router.post('/conversations', asyncRoute(async (req, res) => {
  const body = z.object({ number: z.string() }).parse(req.body); const target = await prisma.phoneNumber.findUnique({ where: { e164: normalizeOverPhoneNumber(body.number) } });
  if (!target?.userId) throw new AppError(404, 'OverPhone user not found'); if (target.userId === req.userId) throw new AppError(400, 'Cannot message yourself'); if (!await allowed(req.userId!, target.userId)) throw new AppError(403, 'Messaging is unavailable');
  const existing = await prisma.conversation.findFirst({ where: { AND: [{ members: { some: { userId: req.userId } } }, { members: { some: { userId: target.userId } } }], members: { every: { userId: { in: [req.userId!, target.userId] } } } } });
  const conversation = existing ?? await prisma.conversation.create({ data: { members: { create: [{ userId: req.userId! }, { userId: target.userId }] } } }); res.status(201).json({ conversation });
}));
router.get('/conversations/:id/messages', asyncRoute(async (req, res) => {
  const conversationId = routeParam(req.params.id); const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: req.userId! } } }); if (!member) throw new AppError(403, 'Not a conversation participant');
  res.json({ messages: await prisma.message.findMany({ where: { conversationId, deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 }) });
}));
router.post('/conversations/:id/messages', asyncRoute(async (req, res) => {
  const conversationId = routeParam(req.params.id); const body = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body); const members = await prisma.conversationMember.findMany({ where: { conversationId } }); const receiver = members.find(member => member.userId !== req.userId);
  if (!receiver || !members.some(member => member.userId === req.userId)) throw new AppError(403, 'Not a conversation participant'); if (!await allowed(req.userId!, receiver.userId)) throw new AppError(403, 'Messaging is unavailable');
  const message = await prisma.$transaction(async tx => { const record = await tx.message.create({ data: { conversationId, senderId: req.userId!, receiverId: receiver.userId, content: body.content } }); await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }); return record; });
  req.app.get('io')?.to(`user:${receiver.userId}`).emit('message:new', message); res.status(201).json({ message });
}));
router.post('/messages/:id/read', asyncRoute(async (req, res) => { const message = await prisma.message.updateMany({ where: { id: routeParam(req.params.id), receiverId: req.userId, readAt: null }, data: { status: 'READ', readAt: new Date() } }); if (!message.count) throw new AppError(404, 'Message not found'); res.status(204).end(); }));
router.delete('/messages/:id', asyncRoute(async (req, res) => { const message = await prisma.message.updateMany({ where: { id: routeParam(req.params.id), senderId: req.userId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!message.count) throw new AppError(404, 'Message not found'); res.status(204).end(); }));
export default router;
