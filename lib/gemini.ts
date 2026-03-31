import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });

export async function transcribeMedia(file: File, prompt: string): Promise<string> {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: file.type,
              data: await fileToBase64(file),
            },
          },
        ],
      },
    ],
  });

  const response = await model;
  return response.text || "Não foi possível transcrever o conteúdo.";
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Traduza o seguinte texto para ${targetLanguage}. Mantenha a formatação e as minutagens se houver:\n\n${text}`,
  });

  return response.text || text;
}

export async function transcribeUrl(url: string, prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `${prompt}\n\nURL: ${url}`,
    config: {
      tools: [{ urlContext: {} }]
    }
  });

  return response.text || "Não foi possível transcrever o conteúdo da URL.";
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}
