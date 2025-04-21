import React, { useState } from 'react';
import { Upload, Button, Spin, Alert, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-layout';

const SeismicAnalyzer: React.FC = () => {
  // 修改状态类型包含 filename
  const [result, setResult] = useState<{
    events?: any;
    confidence?: any;
    filename?: string; // 新增 filename 字段
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setError(null); // 重置错误状态
      const formData = new FormData();
      formData.append('file', file);

      try {
        // 使用代理URL而不是直接访问后端
        console.log('准备上传文件:', file.name);
        const response = await fetch('/flask-api/process', {
          method: 'POST',
          body: formData,
          // 添加超时设置
          signal: AbortSignal.timeout(300000), // 5分钟超时
        });

        console.log('收到响应，状态码:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('后端返回的数据:', data); // 打印后端返回的数据
          message.success('文件处理成功');
          // 添加 filename 到状态
          setResult({
            events: data.events,
            confidence: data.confidence,
            filename: data.filename, // 新增 filename
          });
        } else {
          const errorText = await response.text().catch(() => '无法获取错误信息');
          console.error('请求失败，状态码:', response.status, errorText);
          setError(`请求失败，状态码: ${response.status}. ${errorText}`);
          message.error('文件处理失败，请查看控制台获取详细信息');
        }
      } catch (error) {
        console.error('发生错误:', error);
        setError(`上传处理过程中发生错误: ${error instanceof Error ? error.message : String(error)}`);
        message.error('无法连接到服务器，请确保后端服务已启动');
      } finally {
        setLoading(false);
      }
    }
  };

  // 自定义上传组件
  const customUpload = (
    <div style={{ marginBottom: 20 }}>
      <input 
        type="file" 
        onChange={handleFileUpload} 
        style={{ display: 'none' }} 
        id="fileInput" 
        accept=".mseed,.sac,.miniseed,.seed"
      />
      <Button 
        icon={<UploadOutlined />} 
        onClick={() => document.getElementById('fileInput')?.click()}
        loading={loading}
        type="primary"
      >
        选择地震数据文件
      </Button>
      <span style={{ marginLeft: 8 }}>
        支持.mseed/.sac/.miniseed/.seed格式
      </span>
    </div>
  );

  return (
    <PageContainer title="地震波形分析">
      <div style={{ background: '#fff', padding: 24, minHeight: 280, borderRadius: 2 }}>
        <h2>上传地震数据文件进行分析</h2>
        <p>上传地震波形数据，系统将自动使用DiTing深度学习模型进行分析和检测。</p>
        
        {customUpload}
        
        {error && (
          <Alert
            message="处理错误"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 20 }}
          />
        )}
        
        {loading && (
          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <Spin tip="正在处理文件..." size="large" />
          </div>
        )}
        
        {result && (
          <div>
            {result.filename && (
              <div>
                <h2>地震波形分析结果</h2>
                <img
                  src={`/flask-api/resources/picture/${result.filename}`}
                  alt="地震分析结果图表"
                  style={{ maxWidth: '100%', border: '1px solid #ddd', borderRadius: 4 }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default SeismicAnalyzer;
