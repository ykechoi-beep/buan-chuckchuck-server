export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) throw new Error("API Key가 없습니다.");

        // ★ 신규 사용자도 사용 가능한 최신 모델(gemini-3.8-flash) 적용
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 친절하게 답하세요." }] }
            })
        });

        const data = await response.json();
        let aiText = "죄송합니다. 현재 AI 서버에 접속자가 많아 잠시 후 다시 시도해 주세요.";

        // 정상적으로 답변을 받은 경우
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiText = data.candidates[0].content.parts[0].text;
        } 
        // 구글 API 에러 발생 시
        else if (data.error) {
            console.error("구글 에러 상세:", data.error);
            aiText = `구글 에러: ${data.error.message}`;
        }

        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiText } }]
            }
        });

    } catch (error) {
        console.error("서버 에러:", error);
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "서버 통신 중 에러가 발생했습니다." } }]
            }
        });
    }
}
