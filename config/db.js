import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDB = async () => {
  mongoose.connection.on("disconnected", () => {
    process.stderr.write(
      JSON.stringify({ event: "mongo_disconnected", ts: new Date().toISOString() }) + "\n"
    );
  });

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });
};

export const closeDB = async () => {
  await mongoose.connection.close();
};
