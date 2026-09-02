import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

const app = createApp();

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(
        `[${env.SCHOOL_NAME}] API running on port ${env.PORT} (${env.NODE_ENV})`
      );
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  }
}

start();
