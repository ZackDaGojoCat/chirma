import { GoogleGenAI, Type } from "@google/genai";
import { ChaosEvent } from "../types";

// Initialize Gemini Client
// Note: In a real production app, you might proxy this to hide the key, 
// but for a "hostable on GH pages" demo, using the env var directly is the standard way.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateChaosEvent = async (): Promise<ChaosEvent> => {
  const ai = getAiClient();
  
  // Fallback if no API key is provided
  if (!ai) {
    return {
      name: "Blizzard!",
      description: "It's getting cold! (Fallback Event)",
      type: "SLOWNESS",
      duration: 10,
      active: true
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a random fun "Chaos Event" for a top-down Christmas multiplayer game.
      
      The types allowed are: 
      - SPEED_BOOST (players move fast)
      - SLOWNESS (players move slow)
      - FREEZE (players stuck for 2s)
      - REVERSE_CONTROLS (inputs flipped)
      - DOUBLE_POINTS (presents worth 2x)
      
      Return a JSON object with 'name', 'description', 'type', and 'duration' (integer between 5 and 15).
      Make the name and description Christmas themed (e.g., "Rudolph's Rush", "Too much Eggnog").`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['SPEED_BOOST', 'SLOWNESS', 'FREEZE', 'REVERSE_CONTROLS', 'DOUBLE_POINTS'] },
            duration: { type: Type.INTEGER }
          },
          required: ["name", "description", "type", "duration"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const data = JSON.parse(text);

    return {
      name: data.name,
      description: data.description,
      type: data.type,
      duration: data.duration,
      active: true
    };

  } catch (error) {
    console.error("Gemini failed:", error);
    // Failover
    return {
      name: "Grinch's Trick",
      description: "Something went wrong, but chaos continues!",
      type: "REVERSE_CONTROLS",
      duration: 10,
      active: true
    };
  }
};
