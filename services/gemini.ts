import { GoogleGenAI } from "@google/genai";
import { DataRecord, ChartConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are DataWhisperer, an expert data analyst and visualization assistant.
Your goal is to help users understand their data through clear explanations and relevant charts.

When a user asks a question about their dataset:
1. Analyze the provided data snippet (JSON).
2. If the user's question is best answered with a chart (e.g., "Show me sales over time", "Compare profit by region"), you MUST generate a JSON configuration for the chart.
3. If no chart is needed, provide a clear text answer.

FORMATTING RULES:
- If you generate a chart, include a JSON block wrapped in \`\`\`json\`\`\`.
- The JSON object MUST follow this structure exactly:
  {
    "type": "chart",
    "chartType": "bar" | "line" | "area" | "pie" | "scatter",
    "title": "A descriptive title",
    "explanation": "A brief sentence explaining what this chart shows.",
    "xAxisKey": "The exact key name from the data to use for the X-axis",
    "series": [
      { "key": "The exact key name for the Y-axis data", "color": "#HEXCODE", "name": "Readable Label" }
    ],
    "data": [ ...aggregated or filtered data points... ]
  }
- For the "data" field in the JSON, you should aggregate or filter the original data as needed to suit the chart. Do not just return the raw data if it needs summarization (e.g., sum sales by month).
- Always ensure the "xAxisKey" and "series" keys match the properties in your "data" array objects.

RESPONSE STYLE:
- Be concise but helpful.
- Use Markdown for text formatting.
`;

export const sendMessageToGemini = async (
  prompt: string,
  dataContext: DataRecord[],
  history: { role: 'user' | 'model'; text: string }[] = []
): Promise<{ text: string; chart?: ChartConfig }> => {
  
  // Prepare a data summary to save tokens, or send full data if small.
  // We'll limit to first 100 rows or so for safety, but 2.5 Flash can handle large context.
  // Let's send up to 300 records as context.
  const dataSnippet = dataContext.slice(0, 300);
  const dataContextString = JSON.stringify(dataSnippet);

  const fullPrompt = `
  DATA CONTEXT (First ${dataSnippet.length} rows):
  ${dataContextString}

  USER QUESTION:
  ${prompt}
  `;

  try {
    const model = 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: fullPrompt }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.4, // Lower temp for more accurate data handling
      }
    });

    const responseText = response.text || "I couldn't generate a response.";
    
    // Parse for Chart JSON
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    let chartConfig: ChartConfig | undefined;
    let cleanText = responseText;

    if (jsonMatch) {
      try {
        const potentialJson = JSON.parse(jsonMatch[1]);
        if (potentialJson.type === 'chart') {
          chartConfig = potentialJson;
          // Remove the JSON block from the text shown to user, or keep it?
          // Let's remove it to keep the UI clean, as the chart will render.
          cleanText = responseText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
          if (chartConfig?.explanation && !cleanText) {
             cleanText = chartConfig.explanation;
          }
        }
      } catch (e) {
        console.error("Failed to parse chart JSON from Gemini response", e);
      }
    }

    return { text: cleanText, chart: chartConfig };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Sorry, I encountered an error analyzing your data. Please try again." };
  }
};