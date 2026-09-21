import mongoose from "mongoose";
import { env } from "@/config/env.js";

export async function connectDb(): Promise<void> {
  await mongoose.connect(env.mongodbUri);
}
