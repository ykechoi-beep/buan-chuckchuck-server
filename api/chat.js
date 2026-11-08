export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) throw new Error("API Key가 없습니다.");

        let aiText = "죄송합니다. 현재 구글 AI 서버에 접속자가 많아 잠시 후 다시 시도해 주세요.";
        let success = false;

        // ★ 최대 3번까지 자동 재시도 (1초 -> 2초 -> 4초 대기)
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userMessage }] }],
                        systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
                    })
                });

                const data = await response.json();

                // 정상적으로 답변을 받은 경우
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    aiText = data.candidates[0].content.parts[0].text;
                    success = true;
                    break; // 성공하면 반복문 탈출
                } 
                
                // 503 (서버 과부하) 에러인 경우 -> 대기 후 재시도
                if (response.status === 503 || (data.error && data.error.message.includes("high demand"))) {
                    console.log(`[시도 ${attempt}회] 구글 서버 과부하. ${Math.pow(2, attempt-1)}초 후 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
                    continue;
                }

                // 그 외 API 에러 (키 오류 등)
                if (data.error) {
                    aiText = `구글 에러: ${data.error.message}`;
                    break;
                }
            } catch (err) {
                console.error(`[시도 ${attempt}회] 통신 에러:`, err);
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            }
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
                outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }]
            }
        });
    }
}
