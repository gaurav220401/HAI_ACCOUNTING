import dotenv from "dotenv";
import path from "path";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const client = new GoogleGenAI({ apiKey: apiKey! });

  console.log("Listing available models from Google GenAI API...");
  try {
    const listResult = await client.models.list();
    for await (const model of listResult) {
      console.log(`- ${model.name} (${model.displayName})`);
    }
  } catch (err: any) {
    console.error("Error listing models:", err.message || err);
  }
}

listModels();
