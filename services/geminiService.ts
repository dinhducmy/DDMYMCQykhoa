
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { MCQQuestion, QuizConfig, BloomLevel } from "../types";

export const generateMCQs = async (
  content: { base64?: string; text?: string; mimeType?: string },
  config: QuizConfig
): Promise<MCQQuestion[]> => {
  // Always use new GoogleGenAI({ apiKey: process.env.API_KEY })
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const distributionText = Object.entries(config.bloomDistribution)
    .filter(([_, count]) => (Number(count) || 0) > 0)
    .map(([level, count]) => `- ${level}: ${count} câu`)
    .join('\n');

  const systemInstruction = `
    Bạn là một chuyên gia giáo dục y khoa cao cấp với hơn 20 năm kinh nghiệm biên soạn đề thi. 
    Nhiệm vụ của bạn là phân tích tài liệu được cung cấp và tạo bộ câu hỏi trắc nghiệm (MCQ) chất lượng cao.

    YÊU CẦU QUAN TRỌNG:
    1. PHÂN TÍCH NGUỒN: Trích xuất các kiến thức trọng tâm, các chỉ số lâm sàng, phác đồ điều trị từ tài liệu.
    2. PHÂN LOẠI BLOOM: Thiết kế câu hỏi dựa trên số lượng cụ thể cho từng mức độ sau:
    ${distributionText}
    
    3. PHƯƠNG ÁN NHIỄU: Phải có tính logic cao, dựa trên các sai lầm thường gặp của sinh viên y khoa (nhầm lẫn cơ chế, nhầm lẫn thuốc cùng nhóm, nhầm lẫn triệu chứng tương tự).
    4. CẤU TRÚC PHẢI TUÂN THỦ: Mỗi câu hỏi phải có đầy đủ: Nội dung, 4 phương án, Đáp án đúng, Biện luận chi tiết, Trích dẫn và Giải thích tại sao các phương án khác sai.
  `;

  const prompt = `
    Hãy tạo các câu hỏi trắc nghiệm theo phân bổ sau từ tài liệu:
    ${distributionText}
    
    Đảm bảo nội dung chuyên môn y khoa chính xác 100%. Phản hồi bằng một mảng JSON các đối tượng câu hỏi.
  `;

  const parts: any[] = [];
  
  if (content.base64 && content.mimeType) {
    parts.push({
      inlineData: {
        data: content.base64,
        mimeType: content.mimeType
      }
    });
  } else if (content.text) {
    parts.push({ text: `NỘI DUNG TÀI LIỆU:\n${content.text}` });
  }

  parts.push({ text: prompt });

  try {
    // Use gemini-3-pro-preview for complex reasoning tasks like medical MCQ generation
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ parts }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              order: { type: Type.INTEGER },
              bloomLevel: { type: Type.STRING },
              questionText: { type: Type.STRING },
              options: {
                type: Type.OBJECT,
                properties: {
                  A: { type: Type.STRING },
                  B: { type: Type.STRING },
                  C: { type: Type.STRING },
                  D: { type: Type.STRING },
                },
                required: ["A", "B", "C", "D"]
              },
              correctAnswer: { type: Type.STRING },
              rationale: { type: Type.STRING },
              citation: { type: Type.STRING },
              distractorAnalysis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  },
                  required: ["key", "reason"]
                }
              }
            },
            required: ["id", "order", "bloomLevel", "questionText", "options", "correctAnswer", "rationale", "citation", "distractorAnalysis"]
          }
        }
      }
    });

    const result = JSON.parse(response.text || "[]");
    return result;
  } catch (error) {
    console.error("Error generating MCQs:", error);
    throw error;
  }
};
