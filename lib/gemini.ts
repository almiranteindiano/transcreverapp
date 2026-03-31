import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiInstance) {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("NEXT_PUBLIC_GEMINI_API_KEY não configurada. Adicione-a às variáveis de ambiente.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function transcribeMedia(file: File, prompt: string): Promise<string> {
  const ai = getGeminiClient();
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
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Traduza o seguinte texto para ${targetLanguage}. Mantenha a formatação e as minutagens se houver:\n\n${text}`,
  });

  return response.text || text;
}

export async function transcribeUrl(url: string, prompt: string): Promise<string> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Acesse o conteúdo deste link e realize a transcrição completa do áudio/vídeo contido nele. Se for um vídeo do YouTube ou Instagram, foque no que é falado. \n\nInstrução adicional: ${prompt}\n\nURL: ${url}`,
      config: {
        tools: [{ urlContext: {} }]
      }
    });

    if (!response.text) {
      throw new Error("A IA acessou o link mas não encontrou conteúdo para transcrever.");
    }

    return response.text;
  } catch (error: any) {
    console.error('Erro ao transcrever URL:', error);
    if (error.message?.includes('not supported') || error.message?.includes('blocked')) {
      throw new Error("Este link não pode ser acessado diretamente pela IA. Tente baixar o arquivo e fazer o upload.");
    }
    throw error;
  }
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
