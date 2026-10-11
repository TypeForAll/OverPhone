import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/http.js';

export const OVERPHONE_NATIONAL_DIGITS = 12;

/** Normalizes an OverPhone identifier without applying national carrier rules. */
export function normalizeOverPhoneNumber(input: string) {
  const compact = input.trim().replace(/[\s().-]/g, '');
  if (!/^\+\d{13,15}$/.test(compact)) throw new AppError(400, 'Enter an OverPhone number with a country code and 12 digits');
  return compact;
}

function assertCountryNumber(e164: string, callingCode: string) {
  if (!e164.startsWith(callingCode) || e164.slice(callingCode.length).length !== OVERPHONE_NATIONAL_DIGITS) {
    throw new AppError(400, `Number must use ${callingCode} followed by exactly ${OVERPHONE_NATIONAL_DIGITS} digits`);
  }
}

export async function assignRandomNumber(userId: string, countryId: string) {
  const country = await prisma.country.findUniqueOrThrow({ where: { id: countryId } });
  if (await prisma.phoneNumber.findUnique({ where: { userId } })) throw new AppError(409, 'This account already has an OverPhone number');
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = Array.from({ length: OVERPHONE_NATIONAL_DIGITS }, () => Math.floor(Math.random() * 10)).join('');
    const e164 = `${country.callingCode}${digits}`;
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.phoneNumber.findUnique({ where: { e164 } });
        if (existing?.userId) throw new AppError(409, 'Number already taken');
        if (existing) return tx.phoneNumber.update({ where: { id: existing.id }, data: { userId, reservedUntil: null } });
        return tx.phoneNumber.create({ data: { e164, countryId, userId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') && !(e instanceof AppError)) throw e;
    }
  }
  throw new AppError(503, 'No number could be allocated. Please retry.');
}

export async function claimNumber(userId: string, countryId: string, value: string) {
  const country = await prisma.country.findUniqueOrThrow({ where: { id: countryId } });
  const e164 = normalizeOverPhoneNumber(value);
  assertCountryNumber(e164, country.callingCode);
  if (await prisma.phoneNumber.findUnique({ where: { userId } })) throw new AppError(409, 'This account already has an OverPhone number');
  try {
    return await prisma.$transaction(async tx => {
      const held = await tx.phoneNumber.findUnique({ where: { e164 } });
      if (held?.userId && held.userId !== userId) throw new AppError(409, 'Number already taken');
      if (held) return tx.phoneNumber.update({ where: { id: held.id }, data: { userId, reservedUntil: null } });
      return tx.phoneNumber.create({ data: { e164, countryId, userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(409, 'Number already taken');
    throw e;
  }
}
