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

        let aiText = "죄송합니다. 지금 구글 AI 서버에 접속자가 너무 많아 대답이 지연되고 있습니다. 잠시 후 다시 말씀해 주세요.";
        let success = false;
        
        // 최대 3번까지 재시도하는 안전장치
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey 
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userMessage }] }],
                        systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
                    })
                });

                const data = await response.json();

                // 성공적으로 답변을 받은 경우
                if (data.candidates && data.candidates.length > 0) {
                    const candidate = data.candidates[0];
                    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                        aiText = candidate.content.parts[0].text;
                        success = true;
                        break; // 성공하면 반복문 탈출
                    }
                } 
                
                // 서버 과부하(High Demand) 에러인 경우 1초 대기 후 재시도
                if (data.error && data.error.message.includes("high demand")) {
                    console.log(`시도 ${attempt}회 실패 (서버 과부하). 1초 후 재시도...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                } else if (data.error) {
                    aiText = `구글 에러: ${data.error.message}`;
                    break;
                }
            } catch (err) {
                console.log(`시도 ${attempt}회 통신 에러:`, err);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
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
