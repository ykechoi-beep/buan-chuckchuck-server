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
                const firebaseProjectId = "buan-chuckchuck"; // 본인 프로젝트 ID 확인
                const firebaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/inventory`;
                const fbResponse = await fetch(firebaseUrl);
                const fbData = await fbResponse.json();

                // 2. 사용자의 질문과 관련된 데이터만 필터링
                if (fbData.documents && fbData.documents.length > 0) {
                    const matchedDocs = fbData.documents.filter(doc => {
                        const fields = doc.fields;
                        const searchString = 
                            (fields.소분류?.stringValue || "") + " " +
                            (fields.서비스내용?.stringValue || "") + " " +
                            (fields.키워드?.stringValue || "") + " " +
                            (fields.대분류?.stringValue || "");
                        
                        return userMessage.split(" ").some(word => word.length > 1 && searchString.includes(word));
                    });

                    // 매칭된 데이터가 있으면 프롬프트에 넣을 텍스트로 변환 (최대 10개로 늘려서 더 많은 정보 제공)
                    databaseContext = matchedDocs.slice(0, 10).map(doc => {
                        const f = doc.fields;
                        return `[부안 정보] 
                        분류: ${f.대분류?.stringValue} > ${f.중분류?.stringValue} > ${f.소분류?.stringValue}
                        내용: ${f.서비스내용?.stringValue}
                        기관: ${f.연계기관?.stringValue}
                        전화번호: ${f.전화번호?.stringValue}
                        주소: ${f.주소?.stringValue}`;
                    }).join("\n\n");
                }
            } catch (e) {
                console.error("Firebase 검색 실패:", e);
            }

            try {
                // 3. Groq AI 호출 (환각 방지 프롬프트 적용)
                const systemPrompt = `당신은 부안군의 AI 비서 '부안척척'입니다. 부안군 주민과 관광객에게 친절하게 답하세요. 절대 ###, |, ---, ** 같은 마크다운 기호를 사용하지 말고, 이모지와 줄바꿈만 사용해서 카카오톡 화면에 보기 쉽게 답변하세요.

                다음은 사용자의 질문과 관련하여 부안군 데이터베이스에서 찾아낸 정보입니다. 이 정보를 바탕으로 대답하세요.
                
                ★★★ 절대 규칙 (반드시 지킬 것):
                1. 제공된 [검색된 부안 데이터]에 없는 구체적인 전화번호, 주소, 사람 이름은 절대로 지어내지 마세요. (가짜 번호 생성 금지)
                2. 만약 [검색된 부안 데이터]에 사용자의 질문에 대한 답이 없거나 부족하다면, 당신의 일반 지식으로 대답하되 "정확한 부안 지역의 정보는 데이터베이스에 없습니다. 부안군청(063-580-4000)으로 문의하시면 정확한 안내를 받으실 수 있습니다." 라고 덧붙여서 솔직하게 안내하세요.
                3. 데이터에 있는 정보만을 사용하여 확실하게 안내하세요.

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
                        temperature: 0.1 // ★ 온도를 0.1로 낮춰서 AI가 최대한 사실만 말하게 함
                    })
                });

                const data = await response.json();

                if (data.choices?.[0]?.message?.content) {
                    // ★ AI 답변에서 마크다운 기호(**, ###, ---, |)를 강제로 제거하는 필터
                    let rawText = data.choices[0].message.content;
                    aiText = rawText.replace(/\*\*/g, '').replace(/###/g, '').replace(/---/g, '').replace(/\|/g, '');
                } else if (data.error) {
                    aiText = `Groq 에러: ${data.error.message}`;
                }
            } catch (err) {
                console.error("AI 처리 중 에러:", err);
                aiText = "서버 통신 오류가 발생했습니다.";
            }

            // 4. 카카오톡 '카드형(TextCard)' UI로 전송
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
                                            {
                                                action: "message",
                                                label: "🔄 다시 물어보기",
                                                messageText: "처음으로"
                                            },
                                            {
                                                action: "phone",
                                                label: "📞 상담원 연결",
                                                phoneNumber: "063-580-4000"
                                            }
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
