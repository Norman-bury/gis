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
            # 使用 BytesIO 包装文件流，避免文件指针问题
            from io import BytesIO
            file_content = file.read()
            stream = obspy.read(BytesIO(file_content))
            file.seek(0) # 重置文件指针以防万一
            logger.info(f"成功读取数据流，包含 {len(stream)} 条记录")
        except Exception as e:
            logger.error(f"读取文件失败: {str(e)}")
            return jsonify({"error": f"读取地震数据失败: {str(e)}"}), 400
        
        # 检查数据流是否为空
        if not stream:
            logger.error("数据流为空")
            return jsonify({"error": "解析后的数据流为空"}), 400
            
        # 提取元数据
        try:
            trace = stream[0] # 假设至少有一条记录
            sampling_rate = trace.stats.sampling_rate
            start_time_obj = trace.stats.starttime
            # 转换为 ISO 8601 UTC 字符串
            start_time_iso = start_time_obj.isoformat()
            logger.info(f"提取元数据: 采样率={sampling_rate} Hz, 起始时间={start_time_iso}")
        except (AttributeError, IndexError) as e:
             logger.error(f"从数据流提取元数据失败: {str(e)}")
             return jsonify({"error": f"无法从文件中提取必要的元数据（采样率/起始时间）: {str(e)}"}), 400

        # 使用模型处理数据
        logger.info("开始处理数据...")
        # 注意：DiTing_predict_onnx 返回的 'events' 实际上是 postprocessor 的 'matches'
        # 结构: [[bg, [[p_idx, p_prob]], [[s_idx, s_prob]]], ...]
        events_matches, confidence_waveforms = DiTing_predict_onnx(
            ort_session, stream, 
            window_length=10000, step_size=3000, 
            p_th=0.1, s_th=0.1, det_th=0.3
        )
        logger.info(f"模型处理完成，检测到 {len(events_matches)} 个匹配事件结构")
        
        # 保存结果图像
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        # 使用原始文件名的一部分创建更可读的图像文件名
        base_filename = os.path.splitext(file.filename)[0]
        plot_filename = f"{base_filename}_{timestamp}.png"
        save_path = os.path.join(pictures_dir, plot_filename)
        
        logger.info(f"生成可视化结果，保存至: {save_path}")
        try:
            # 确保传递正确的 events 结构给 visualize_results
            visualize_results(stream, events_matches, output_file=save_path)
        except Exception as vis_e:
             logger.error(f"生成可视化图像时出错: {str(vis_e)}")
             # 即使可视化失败，也尝试返回数据
             plot_filename = None # 设为 None 表示无图

        # 检查图像是否成功生成 (如果 visualize_results 没有抛出错误)
        if plot_filename and not os.path.exists(save_path):
            logger.warning(f"图像文件未成功生成: {save_path}")
            plot_filename = None # 设为 None 表示无图
            
        logger.info("处理事件数据以匹配前端格式...")
        p_arrival_indices = []
        s_arrival_indices = []
        p_confidence_list = []
        s_confidence_list = []
        
        # 处理 DiTing_predict_onnx 返回的 events_matches 结构
        if events_matches and not (len(events_matches) == 1 and np.isnan(events_matches[0][0])):
            for match in events_matches:
                try:
                    # 提取 P 波信息
                    p_info = match[1][0]
                    p_idx = p_info[0]
                    p_prob = p_info[1]
                    if not np.isnan(p_idx):
                        p_arrival_indices.append(p_idx)
                        p_confidence_list.append(p_prob)
                    else:
                        # 如果 P 波无效，则跳过此事件或添加 None？根据需求，这里跳过
                        logger.warning("检测到无效 P 波索引，跳过此事件匹配。")
                        continue # 或者都添加 None? p_arrival_indices.append(None), p_confidence_list.append(None)
                    
                    # 提取 S 波信息
                    s_info = match[2][0]
                    s_idx = s_info[0]
                    s_prob = s_info[1]
                    s_arrival_indices.append(None if np.isnan(s_idx) else s_idx)
                    s_confidence_list.append(None if np.isnan(s_prob) else s_prob)
                    
                except (IndexError, TypeError) as e:
                    logger.error(f"处理事件匹配时出错: {match}，错误: {e}")
                    # 如果单个事件处理失败，可以选择跳过或添加 None
                    # 这里选择不添加，避免数据不一致
                    continue 
        else:
            logger.info("未检测到有效事件或事件列表为空。")
        
        # 确保所有列表长度一致 (如果上面处理逻辑没问题，应该是一致的)
        # assert len(p_arrival_indices) == len(s_arrival_indices) == len(p_confidence_list) == len(s_confidence_list)

        # 转换 NumPy 类型为 Python 内置类型，并处理 None
        final_p_indices = numpy_to_list(p_arrival_indices)
        final_s_indices = numpy_to_list(s_arrival_indices)
        final_p_confidence = numpy_to_list(p_confidence_list)
        final_s_confidence = numpy_to_list(s_confidence_list)

        logger.info("请求处理成功，返回格式化结果")
        return jsonify({
            # 移除旧的 'events' 和 'confidence'
            # 'events': events_list, 
            # 'confidence': confidence_list, 
            'plot_filename': plot_filename, # 重命名
            'p_arrival_indices': final_p_indices,
            's_arrival_indices': final_s_indices,
            'p_confidence': final_p_confidence,
            's_confidence': final_s_confidence,
            'start_time_utc': start_time_iso,
            'sampling_rate_hz': sampling_rate
        })
        
    except Exception as e:
        logger.error(f"处理过程中发生未知错误: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"处理过程中发生未知错误: {str(e)}"}), 500

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