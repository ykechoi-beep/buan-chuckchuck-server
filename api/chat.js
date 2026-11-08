export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 사용자가 카카오톡에 입력한 말
        const userMessage = req.body.userRequest.utterance;
        
        // Vercel에 저장해둔 안전한 API 키를 불러옵니다
        const apiKey = process.env.GEMINI_API_KEY; 

        // 구글 Gemini AI에게 대답 요청
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: "당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요." }] }
            })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;

        // 카카오톡 화면에 보여줄 답변 형식
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiText } }]
            }
        });
    } catch (error) {
        console.error(error);
        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: "죄송합니다. 지금은 대답하기 어렵습니다. 잠시 후 다시 시도해 주세요." } }]
            }
        });
    }
} 
 
