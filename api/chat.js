export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const userMessage = req.body?.userRequest?.utterance || req.body?.userRequest?.params?.utterance || "안녕하세요";
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("👉 에러: Vercel에 GEMINI_API_KEY 환경변수가 없습니다.");
            throw new Error("API Key missing");
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }]
            })
        });

        const data = await response.json();
        
        // ★ 구글 API가 뭐라고 답했는지 Vercel 로그에 출력합니다.
        console.log("👉 구글 API 응답 결과:", JSON.stringify(data));

        let aiText = "구글 API에서 답변을 받지 못했습니다.";
        
        if (data.candidates && data.candidates.length > 0) {
            aiText = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            // 구글에서 에러를 리턴한 경우 그 내용을 카카오톡으로 보냅니다.
            aiText = `구글 에러: ${data.error.message}`;
        }

        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiText } }]
            }
        });

    } catch (error) {
        console.error("👉 서버 내부 에러:", error);
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "서버 통신 중 에러가 발생했습니다." } }]
            }
        });
    }
}
