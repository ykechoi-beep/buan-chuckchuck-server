export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

        let aiText = "죄송합니다. 현재 AI 서버에 접속자가 많아 잠시 후 다시 시도해 주세요.";
        let success = false;

        // 구글 서버 과부하 대비 최대 3번 재시도
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // ★ 구글 공식 최신 모델(gemini-3.8-flash) 적용
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userMessage }] }],
                        systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
                    })
                });

                const data = await response.json();

                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    aiText = data.candidates[0].content.parts[0].text;
                    success = true;
                    break;
                } 
                
                // 503(과부하) 에러 시 대기 후 재시도
                if (response.status === 503 || (data.error && data.error.message.includes("high demand"))) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
                    continue;
                }

                if (data.error) {
                    aiText = `구글 에러: ${data.error.message}`;
                    break;
                }
            } catch (err) {
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
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "서버 통신 중 오류가 발생했습니다." } }]
            }
        });
    }
}
