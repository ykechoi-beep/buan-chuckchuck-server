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
                const firebaseProjectId = "buan-chuckchuck"; 
                let allDocuments = [];
                let nextPageToken = null;
                let pageCount = 0;

                // ★ [핵심 수정] 모든 데이터를 끝까지 읽어오는 반복문 (최대 3,000건)
                do {
                    let url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/inventory?pageSize=1000`;
                    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

                    const fbResponse = await fetch(url);
                    const fbData = await fbResponse.json();

                    if (fbData.documents) {
                        allDocuments = allDocuments.concat(fbData.documents);
                    }
                    nextPageToken = fbData.nextPageToken;
                    pageCount++;
                } while (nextPageToken && pageCount < 3); // 최대 3번(3000개)까지 읽기

                // 2. 사용자의 질문에서 핵심 키워드 추출
                const stopWords = ["해야", "하는데", "알아", "어디", "있어", "알려줘", "싶어", "해줘", "에서", "으로", "하고", "전화번호"];
                const keywords = userMessage.split(" ").filter(word => word.length > 1 && !stopWords.includes(word));

                if (allDocuments.length > 0) {
                    const matchedDocs = allDocuments.filter(doc => {
                        const fields = doc.fields;
                        const searchString = 
                            (fields.대분류?.stringValue || "") + " " +
                            (fields.중분류?.stringValue || "") + " " +
                            (fields.소분류?.stringValue || "") + " " +
                            (fields.서비스내용?.stringValue || "") + " " +
                            (fields.키워드?.stringValue || "");
                        
                        return keywords.some(word => searchString.includes(word));
                    });

                    // 매칭된 데이터가 있으면 최대 20개까지 프롬프트에 넣기
                    databaseContext = matchedDocs.slice(0, 20).map(doc => {
                        const f = doc.fields;
                        return `[부안 정보] 
                        이름: ${f.소분류?.stringValue}
                        분류: ${f.대분류?.stringValue} > ${f.중분류?.stringValue}
                        전화번호: ${f.전화번호?.stringValue || "번호 없음"}
                        주소: ${f.주소?.stringValue || "주소 없음"}`;
                    }).join("\n\n");
                }
            } catch (e) {
                console.error("Firebase 검색 실패:", e);
            }

            try {
                const systemPrompt = `당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요. 절대 ###, |, ---, ** 같은 마크다운 기호를 사용하지 말고, 이모지와 줄바꿈만 사용해서 카카오톡 화면에 보기 쉽게 답변하세요.

                다음은 사용자의 질문과 관련하여 부안군 데이터베이스에서 찾아낸 정보입니다.
                
                ★★★ 절대 규칙:
                1. 사용자의 질문과 정확히 일치하는 정보만 골라서 대답하세요. (예: '요양원'을 물으면 '경로당'은 제외)
                2. 제공된 데이터에 없는 전화번호, 주소는 절대로 지어내지 마세요.
                3. 만약 데이터에 질문에 맞는 정확한 정보가 없다면 "죄송합니다. 해당 정보는 현재 데이터베이스에 없습니다." 라고 솔직하게 대답하세요.

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
                        temperature: 0.1 
                    })
                });

                const data = await response.json();

                if (data.choices?.[0]?.message?.content) {
                    let rawText = data.choices[0].message.content;
                    aiText = rawText.replace(/\*\*/g, '').replace(/###/g, '').replace(/---/g, '').replace(/\|/g, '');
                } else if (data.error) {
                    aiText = `Groq 에러: ${data.error.message}`;
                }
            } catch (err) {
                console.error("AI 처리 중 에러:", err);
                aiText = "서버 통신 오류가 발생했습니다.";
            }

            if (callbackUrl) {
                const safeDescription = aiText.substring(0, 800); 
                await fetch(callbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        version: "2.0",
                        template: {
                            outputs: [
                                {
                                    textCard: {
                                        title: "부안척척 AI 비서 🤖",
                                        description: safeDescription,
                                        buttons: [
                                            { action: "message", label: "🔄 다시 물어보기", messageText: "처음으로" },
                                            { action: "phone", label: "📞 상담원 연결", phoneNumber: "063-580-4000" }
                                        ]
                                    }
                                }
                            ]
                        }
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
