import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { bin: "0001234567890" },
    update: {},
    create: {
      name: "Selefe Trading Ltd.",
      bin: "0001234567890",
      tin: "123456789012",
      commissionerate: "Dhaka South",
      division: "Motijheel",
      circle: "Circle-12",
      economicActivity: "Wholesale & retail trade",
      address: "Dhaka, Bangladesh",
    },
  });

  // Demo owner login — owner@selefe.test / Password123
  await prisma.user.upsert({
    where: { email: "owner@selefe.test" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "owner@selefe.test",
      passwordHash: await bcrypt.hash("Password123", 10),
      name: "Demo Owner",
      role: "OWNER",
    },
  });

  await prisma.transaction.create({
    data: {
      tenantId: tenant.id,
      kind: "SALE",
      status: "ISSUED",
      mushakNo: "6.3-0001",
      issuedAt: new Date("2026-06-05"),
      netTotal: "100000.00",
      sdTotal: "0.00",
      vatTotal: "15000.00",
      grandTotal: "115000.00",
      lines: {
        create: [
          {
            description: "Finished goods",
            quantity: "100",
            unitPrice: "1000",
            vatRate: "0.15",
            sdRate: "0",
            netValue: "100000.00",
            sdAmount: "0.00",
            vatAmount: "15000.00",
            lineTotal: "115000.00",
          },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      tenantId: tenant.id,
      kind: "PURCHASE",
      status: "ISSUED",
      rebateEligible: true,
      mushakNo: "SUP-INV-77",
      issuedAt: new Date("2026-06-03"),
      netTotal: "60000.00",
      sdTotal: "0.00",
      vatTotal: "9000.00",
      grandTotal: "69000.00",
      lines: {
        create: [
          {
            description: "Raw materials",
            quantity: "60",
            unitPrice: "1000",
            vatRate: "0.15",
            sdRate: "0",
            netValue: "60000.00",
            sdAmount: "0.00",
            vatAmount: "9000.00",
            lineTotal: "69000.00",
          },
        ],
      },
    },
  });

  console.log(`Seeded tenant ${tenant.id} (BIN ${tenant.bin}) with demo sale + purchase.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
