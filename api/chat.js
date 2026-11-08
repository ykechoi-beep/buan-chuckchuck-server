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
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) throw new Error("GROQ_API_KEY is missing");

        res.status(200).json({ version: "2.0", useCallback: true });

        const processAI = async () => {
            let aiText = "죄송합니다. 현재 AI 서버에 접속자가 많아 잠시 후 다시 시도해 주세요.";
            let databaseContext = "";

            try {
                // 1. Firebase에서 부안 인벤토리 데이터 불러오기
                const firebaseProjectId = "buan-chuckchuck"; // 본인 프로젝트 ID (다르면 수정하세요)
                const firebaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/inventory`;
                const fbResponse = await fetch(firebaseUrl);
                const fbData = await fbResponse.json();

                // 2. 사용자의 질문과 관련된 데이터만 필터링 (간이 RAG)
                if (fbData.documents && fbData.documents.length > 0) {
                    const matchedDocs = fbData.documents.filter(doc => {
                        const fields = doc.fields;
                        // 검색 대상: 소분류, 서비스내용, 키워드
                        const searchString = 
                            (fields.소분류?.stringValue || "") + " " +
                            (fields.서비스내용?.stringValue || "") + " " +
                            (fields.키워드?.stringValue || "");
                        
                        // 사용자의 질문 단어 중 하나라도 포함되어 있으면 매칭
                        return userMessage.split(" ").some(word => word.length > 0 && searchString.includes(word));
                    });

                    // 매칭된 데이터가 있으면 프롬프트에 넣을 텍스트로 변환 (최대 5개)
                    databaseContext = matchedDocs.slice(0, 5).map(doc => {
                        const f = doc.fields;
                        return `[부안 정보] 
                        분류: ${f.대분류?.stringValue} > ${f.중분류?.stringValue} > ${f.소분류?.stringValue}
                        내용: ${f.서비스내용?.stringValue}
                        기관: ${f.연계기관?.stringValue}
                        키워드: ${f.키워드?.stringValue}`;
                    }).join("\n\n");
                }
            } catch (e) {
                console.error("Firebase 검색 실패:", e);
            }

            try {
                // 3. Groq AI 호출 (검색된 부안 데이터를 참고하도록 지시)
                const systemPrompt = `당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요. 절대 ###, |, ---, ** 같은 마크다운 기호를 사용하지 말고, 이모지와 줄바꿈만 사용해서 카카오톡 화면에 보기 쉽게 답변하세요.

                다음은 사용자의 질문과 관련하여 부안군 데이터베이스에서 찾아낸 정보입니다. 이 정보를 바탕으로 대답하세요. 만약 정보가 없다면 당신의 일반 지식을 활용하되, 모르는 것은 솔직히 모른다고 하세요.
                
                [검색된 부안 데이터]
                ${databaseContext || "검색된 데이터가 없습니다."}`;

                const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}` 
                    },
                    body: JSON.stringify({
                        model: "openai/gpt-oss-120b", 
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userMessage }
                        ],
                        temperature: 0.3 // 정확한 정보 전달을 위해 온도를 낮춤
                    })
                });

                const data = await response.json();

                if (data.choices?.[0]?.message?.content) {
                    aiText = data.choices[0].message.content;
                } else if (data.error) {
                    aiText = `Groq 에러: ${data.error.message}`;
                }
            } catch (err) {
                console.error("AI 처리 중 에러:", err);
                aiText = "서버 통신 오류가 발생했습니다.";
            }

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

        waitUntil(processAI());

    } catch (error) {
        console.error("서버 에러:", error);
        if (!res.headersSent) {
            res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "시스템 오류가 발생했습니다." } }] } });
        }
    }
}
