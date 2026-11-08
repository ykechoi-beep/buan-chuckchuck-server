export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 카카오톡 요청에서 사용자 발화 추출 (구조 방어 코드 포함)
        const userMessage = req.body?.userRequest?.utterance || req.body?.userRequest?.params?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is missing");
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
            })
        });

        const data = await response.json();

        // ★ 핵심 수정: candidates 배열이 존재하고, 첫 번째 항목이 있는지 확인
        let aiText = "죄송합니다. 지금은 대답을 생성하지 못했습니다. 다시 한번 말씀해 주시겠어요?";
        
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                aiText = candidate.content.parts[0].text;
            }
        }

        // 카카오톡 화면에 보여줄 답변 형식
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiText } }]
            }
        });

    } catch (error) {
        console.error("Error details:", error);
        // 에러 발생 시에도 카카오톡에는 정상적인 JSON 응답을 보냄
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "죄송합니다. 시스템에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }]
            }
        });
    }
}
