import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const callbackUrl = req.body?.userRequest?.callbackUrl; // 카카오가 제공하는 콜백 URL
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

        // 1. 카카오에 즉시 "잠시만 기다려 주세요" 응답을 반환 (5초 타임아웃 방지)
        res.status(200).json({ version: "2.0", useCallback: true });

        // 2. 백그라운드에서 AI 호출 (waitUntil로 Vercel 함수가 조기 종료되지 않도록 보장)
        const processAI = async () => {
            let aiText = "죄송합니다. 지금은 대답을 생성하지 못했습니다.";
            try {
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
            }

            // 3. 준비된 답변을 카카오 콜백 URL로 전송
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

        // waitUntil을 사용하여 백그라운드 작업이 완료될 때까지 Vercel 함수 유지
        waitUntil(processAI());

    } catch (error) {
        console.error("서버 에러:", error);
        // 예외 발생 시에도 카카오가 멈추지 않도록 에러 응답 반환
        res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }] } });
    }
}
