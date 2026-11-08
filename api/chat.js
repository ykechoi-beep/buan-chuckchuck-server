import { waitUntil } from '@vercel/functions';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const callbackUrl = req.body?.userRequest?.callbackUrl;
        const apiKey = process.env.GEMINI_API_KEY;

        // 1. 카카오에 "잠시만 기다려 주세요" 즉시 반환
        res.status(200).json({ version: "2.0", useCallback: true });

        // 2. 백그라운드 작업 (AI 호출 및 콜백 전송)
        const processAI = async () => {
            let aiText = "죄송합니다. 답변을 가져오지 못했습니다.";
            try {
                // ★ 에러 메시지에서 요구한 최신 모델(gemini-3.8-flash) 적용
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userMessage }] }],
                        systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 친절하게 답하세요." }] }
                    })
                });

                const data = await response.json();
                
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    aiText = data.candidates[0].content.parts[0].text;
                } else if (data.error) {
                    aiText = `구글 에러: ${data.error.message}`;
                }
            } catch (err) {
                console.error("AI 처리 중 에러:", err);
                aiText = "서버 통신 오류가 발생했습니다.";
            }

            // 3. 준비된 답변을 카카오 콜백 주소로 전송 (에러가 나도 무조건 전송 시도)
            if (callbackUrl) {
                await fetch(callbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        version: "2.0",
                        template: { outputs: [{ simpleText: { text: aiText } }] }
                    })
                }).catch(e => console.error("콜백 전송 실패:", e));
            }
        };

        // 3. 백그라운드 작업 실행
        waitUntil(processAI());

    } catch (error) {
        console.error("서버 에러:", error);
        if (!res.headersSent) {
            res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }] } });
        }
    }
}
