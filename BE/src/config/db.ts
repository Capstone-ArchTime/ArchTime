import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDb(): Promise<void> {
  // mongodb+srv:// is resolved by Node's own resolver, which some machines point at a dead DNS server (127.0.0.1).
  const servers = (process.env.DNS_SERVERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (servers.length > 0) dns.setServers(servers);
  await mongoose.connect(env.mongodbUri);
}
