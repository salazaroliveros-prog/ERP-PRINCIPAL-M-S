import { GoogleGenAI } from "@google/genai";

async function generateLogo() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: 'A professional and distinctive logo for a construction ERP application named "CONSTRUCTORA WM_M&S". The logo should reflect solidity, construction, and modernity. It should feature abstract geometric shapes suggesting building structures or architectural lines. Use a color palette of deep blue, slate gray, and a vibrant accent color like orange or gold. The design should be clean, minimalist, and suitable for a corporate enterprise software.',
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64EncodeString = part.inlineData.data;
      const imageUrl = `data:image/png;base64,${base64EncodeString}`;
      console.log("LOGO_URL_START");
      console.log(imageUrl);
      console.log("LOGO_URL_END");
    }
  }
}

generateLogo();
