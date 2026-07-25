import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaLibSQL({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();
