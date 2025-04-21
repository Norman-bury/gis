import sys
import os
from tempfile import tempdir
# 在最早阶段设置环境变量
os.environ['KMP_DUPLICATE_LIB_OK'] = 'True'  # 允许重复加载 OpenMP 运行时

# 在文件顶部添加 matplotlib 后端设置
import matplotlib
matplotlib.use('Agg')  # 强制使用非交互式后端
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS  # 导入 CORS
import numpy as np  # 确保已经导入 numpy
import obspy
import onnxruntime as ort
import torch
from dt_onnx_inference_windows import load_onnx_model, preprocess_stream, DiTing_predict_onnx,visualize_results
from datetime import datetime
import traceback
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

base_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(base_dir, 'DiTing0.1B_v15.onnx')

parent_dir = os.path.dirname(base_dir)

# 确保必要的目录存在
resources_dir = os.path.join(parent_dir, 'resources')
pictures_dir = os.path.join(resources_dir, 'picture')
os.makedirs(pictures_dir, exist_ok=True)
logger.info(f"资源目录: {resources_dir}")
logger.info(f"图片目录: {pictures_dir}")

# 修正目录名称
tempdir = resources_dir
app = Flask(__name__, static_folder=resources_dir, static_url_path='/resources')

# 启用 CORS，允许所有源
CORS(app, resources={r"/*": {"origins": "*"}})
logger.info("已启用CORS，允许所有源")

# 载入模型
try:
    logger.info(f"正在加载ONNX模型: {model_path}")
    ort_session = load_onnx_model(model_path)
    logger.info("模型加载成功")
except Exception as e:
    logger.error(f"加载模型失败: {str(e)}")
    traceback.print_exc()
    ort_session = None

def numpy_to_list(data):
    if isinstance(data, np.ndarray):
        return data.tolist()
    # 添加 UTCDateTime 类型处理
    elif isinstance(data, obspy.UTCDateTime):
        return data.strftime("%Y-%m-%dT%H:%M:%S.%fZ")  # 转换为ISO格式字符串
    elif isinstance(data, (np.int64, np.int32, np.int16, np.int8, np.uint64, np.uint32, np.uint16, np.uint8)):
        return int(data)
    elif isinstance(data, (np.float64, np.float32, np.float16)):
        return float(data)
    elif isinstance(data, list):
        return [numpy_to_list(item) for item in data]
    elif isinstance(data, dict):
        return {key: numpy_to_list(value) for key, value in data.items()}
    else:
        return data

@app.route('/process', methods=['POST'])
def process_file():
    if ort_session is None:
        logger.error("模型未正确加载，无法处理请求")
        return jsonify({"error": "模型未正确加载，请检查服务器日志"}), 500
    
    try:
        logger.info("接收到文件上传请求")
        
        # 检查是否有文件
        if 'file' not in request.files:
            logger.error("请求中没有文件")
            return jsonify({"error": "没有找到上传的文件"}), 400
            
        file = request.files['file']
        
        # 检查文件名
        if file.filename == '':
            logger.error("上传的文件名为空")
            return jsonify({"error": "上传的文件名为空"}), 400
            
        logger.info(f"处理文件: {file.filename}")
        
        # 读取地震数据
        try:
            stream = obspy.read(file)
            logger.info(f"成功读取数据流，包含 {len(stream)} 条记录")
        except Exception as e:
            logger.error(f"读取文件失败: {str(e)}")
            return jsonify({"error": f"读取地震数据失败: {str(e)}"}), 400
        
        # 使用模型处理数据
        logger.info("开始处理数据...")
        events, confidence = DiTing_predict_onnx(
            ort_session, stream, 
            window_length=10000, step_size=3000, 
            p_th=0.1, s_th=0.1, det_th=0.3
        )
        logger.info(f"处理完成，检测到 {len(events)} 个事件")
        
        # 保存结果图像
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        save_path = os.path.join(pictures_dir, f"{timestamp}.png")
        filename = os.path.basename(save_path)
        
        logger.info(f"生成可视化结果，保存至: {save_path}")
        visualize_results(stream, events, output_file=save_path)
        
        # 检查图像是否成功生成
        if not os.path.exists(save_path):
            logger.error(f"图像文件未成功生成: {save_path}")
            return jsonify({"error": "生成结果图像失败"}), 500
            
        logger.info("转换数据格式...")
        events_list = numpy_to_list(events)
        confidence_list = numpy_to_list(confidence)
        
        logger.info("请求处理成功，返回结果")
        return jsonify({
            'events': events_list, 
            'confidence': confidence_list, 
            'filename': filename
        })
        
    except Exception as e:
        logger.error(f"处理过程中发生错误: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"处理过程中发生错误: {str(e)}"}), 500

# 图片路由
@app.route('/resources/picture/<filename>')
def serve_image(filename):
    logger.info(f"请求图片: {filename}")
    return send_from_directory(pictures_dir, filename)

# 健康检查路由
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "model_loaded": ort_session is not None,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

# 测试路由，检查CORS是否工作
@app.route('/test', methods=['GET', 'POST'])
def test_endpoint():
    logger.info(f"收到测试请求，方法: {request.method}")
    return jsonify({"message": "测试成功", "method": request.method})

if __name__ == '__main__':
    logger.info("启动Flask服务器...")
    # 使用0.0.0.0允许外部访问，端口改为8080避免与macOS AirPlay冲突
    app.run(host='0.0.0.0', port=8080, debug=True)