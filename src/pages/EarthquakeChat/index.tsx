import React, { useState, useEffect, useRef } from 'react';
import { PageContainer } from '@ant-design/pro-layout';
import { Card, List, Avatar, Input, Button, Space, Spin, message as antdMessage } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import styles from './index.less'; // 需要创建对应的 less 文件来定义样式

// --- System Prompt Definition ---
const systemPrompt = `角色设定：扮演地震博士，使用温暖且平易近人的语气，模拟与学生或社区成员的对话。
内容：要求提供科学准确信息，并使用类比和例子，如解释板块构造时可比作拼图移动。
风格：
连续段落写作，避免列表。
避免"首先"等词，使用自然连接如"此外"或"因此"，但需谨慎使用。
避免陈词滥调，如"需要注意的是"，保持语言新鲜。
仅在必要时用形容词，强调理解而非修饰。
变化句式，确保节奏自然，逻辑连贯。
回答永远都是中文`;

// --- Gemini API 配置 ---
// 警告：直接在前端嵌入 API 密钥是不安全的，仅用于本地开发测试！
// 在生产环境中，请使用后端代理或其他安全方式。
const API_KEY = 'AIzaSyDjUqa3DexZUSdijOmetejnyoB-4hXHTyY';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash-latest',
  // Add the system instruction during initialization
  systemInstruction: {
    role: "model", // Role for system instruction is typically 'model' or omitted based on SDK
    parts: [{ text: systemPrompt }],
  },
});
// Safety Settings (Optional but recommended)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
// --- API 配置结束 ---

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const EarthquakeChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '你好！我是 AI 地震助手，有什么可以帮你的吗？' },
  ]);
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<any>(null); // 使用 any 避免 TextAreaRef 类型问题

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = { role: 'user', content: inputValue };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setLoading(true);
    inputRef.current?.focus();
    requestAnimationFrame(scrollToBottom);

    try {
      // --- Construct request with history (optional but good for context) and current input ---
      // Simplified history for now, just sending current input
      const contents = [{ role: 'user', parts: [{ text: currentInput }] }];

      // --- Call API with contents and safety settings ---
      // Note: System instruction is now part of the model initialization
      const result = await model.generateContent({ 
          contents: contents, 
          safetySettings: safetySettings 
      });
      const response = await result.response;
      const text = response.text();
      const assistantMessage: Message = { role: 'assistant', content: text };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);
      // --- API 调用结束 ---
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      antdMessage.error('调用 AI 地震助手失败，请稍后再试。'); // Updated error message name
      const errorMessage: Message = {
         role: 'assistant',
         content: '抱歉，我现在无法回答你的问题，请检查网络或稍后再试。' // More specific error
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setLoading(false);
      requestAnimationFrame(scrollToBottom);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 阻止默认换行行为
      handleSend();
    }
  };


  return (
    <PageContainer title="AI 地震助手">
      <div className={styles.chatContainer}>
        <div className={styles.messageListContainer}>
          <List
            itemLayout="horizontal"
            dataSource={messages}
            renderItem={(item) => (
              <List.Item
                className={item.role === 'user' ? styles.userMessage : styles.assistantMessage}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={item.role === 'user' ? <UserOutlined /> : <RobotOutlined />} />}
                  title={item.role === 'user' ? '你' : 'AI 地震助手'}
                  description={<div className={styles.messageContent}>{item.content}</div>}
                />
              </List.Item>
            )}
          />
          {loading && (
            <div className={styles.loadingIndicator}>
              <Spin /> <span style={{ marginLeft: '8px' }}>正在思考...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.inputAreaContainer}>
            <Input.TextArea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="请输入你的问题... (按 Enter 发送)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={loading}
              className={styles.inputTextArea}
            />
            <Button type="primary" onClick={handleSend} loading={loading}>
              发送
            </Button>
        </div>
      </div>
    </PageContainer>
  );
};

export default EarthquakeChat; 