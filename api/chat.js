export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || req.body?.userRequest?.params?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is missing");
        }

        // ★ 모델명을 gemini-2.5-flash로 변경했습니다.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
            })
        });

        const data = await response.json();

        let aiText = "죄송합니다. 지금은 대답을 생성하지 못했습니다. 다시 한번 말씀해 주시겠어요?";
        
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                aiText = candidate.content.parts[0].text;
            }
        } else if (data.error) {
            aiText = `구글 에러: ${data.error.message}`;
        }

        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiText } }]
            }
        });

    } catch (error) {
        console.error("Error details:", error);
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "죄송합니다. 시스템에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }]
            }
        });
    }
}
