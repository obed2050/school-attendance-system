
import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import rootRoutes from "./routes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

const allowedOrigins = [
  env.CLIENT_URL,
  env.FRONTEND_URL,
]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.replace(/\/$/, ""));

// eslint-disable-next-line no-console
console.log("[CORS] Allowed origins:", JSON.stringify(allowedOrigins));

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        console.error("[CORS] Blocked origin:", origin);

        return callback(
          new Error(`Origin not allowed by CORS: ${origin}`)
        );
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      optionsSuccessStatus: 204,
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(rootRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
