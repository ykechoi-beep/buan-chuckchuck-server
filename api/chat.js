import { waitUntil } from '@vercel/functions';

export const config = {
    maxDuration: 60, // 백그라운드 작업을 위해 최대 60초까지 허용
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const callbackUrl = req.body?.userRequest?.callbackUrl;
        // Vercel에 등록한 Groq API 키를 불러옵니다.
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) throw new Error("GROQ_API_KEY is missing");

        // 1. 카카오톡에 즉시 "잠시만 기다려 주세요" 응답을 반환하여 5초 타임아웃 방지
        res.status(200).json({ version: "2.0", useCallback: true });

        // 2. 백그라운드에서 AI 호출 및 카카오 콜백 전송
        const processAI = async () => {
            let aiText = "죄송합니다. 현재 AI 서버에 접속자가 많아 잠시 후 다시 시도해 주세요.";
            
            try {
                // Groq API 호출 (OpenAI 규격 사용)
                const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}` 
                    },
                    body: JSON.stringify({
                        // Groq에서 지원하는 OpenAI 오픈소스 모델 적용
                        model: "openai/gpt-oss-120b", 
                        messages: [
                            { role: "system", content: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." },
                            { role: "user", content: userMessage }
                        ],
                        temperature: 0.7
                    })
                });

                const data = await response.json();

                // 정상적으로 답변을 받은 경우
                if (data.choices?.[0]?.message?.content) {
                    aiText = data.choices[0].message.content;
                } else if (data.error) {
                    aiText = `Groq 에러: ${data.error.message}`;
                }
            } catch (err) {
                console.error("AI 처리 중 에러:", err);
                aiText = "서버 통신 오류가 발생했습니다.";
            }

            // 3. 준비된 답변을 카카오 콜백 주소로 전송
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

        // Vercel 환경에서 백그라운드 작업이 완료될 때까지 기다리도록 실행
        waitUntil(processAI());

    } catch (error) {
        console.error("서버 에러:", error);
        if (!res.headersSent) {
            res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }] } });
        }
    }
}
