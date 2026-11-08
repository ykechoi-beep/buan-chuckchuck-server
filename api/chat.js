export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || "안녕하세요";
        const callbackUrl = req.body?.userRequest?.callbackUrl; // 카카오가 준 1회용 콜백 주소
        const apiKey = process.env.GEMINI_API_KEY;

        // 1. 카카오에 "잠시만 기다려 주세요" 응답을 즉시 반환 (5초 타임아웃 방지)
        res.status(200).json({
            version: "2.0",
            useCallback: true // 이 값을 true로 보내면 카카오가 기다려줍니다.
        });

        // 2. 백그라운드에서 AI 호출 및 재시도 로직 실행
        let aiText = "죄송합니다. 지금은 대답을 생성하지 못했습니다.";
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userMessage }] }],
                        systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다." }] }
                    })
                });
                const data = await response.json();

                if (data.candidates && data.candidates.length > 0) {
                    aiText = data.candidates[0].content.parts[0].text;
                    break; // 성공 시 반복문 종료
                }
                if (data.error && data.error.message.includes("high demand")) {
                    await new Promise(r => setTimeout(r, 1000)); // 1초 대기 후 재시도
                    continue;
                }
                if (data.error) { aiText = `구글 에러: ${data.error.message}`; break; }
            } catch (e) { await new Promise(r => setTimeout(r, 1000)); }
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
            });
        }
    } catch (error) {
        console.error("서버 에러:", error);
        // 예외 발생 시에도 카카오가 멈추지 않도록 에러 응답이라도 반환
        res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }] } });
    }
}
