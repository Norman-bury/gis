#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DiTing 0.1B ONNX模型在Windows环境下的推理脚本
"""

import os
import numpy as np
import onnxruntime as ort
import obspy
import matplotlib.pyplot as plt
from post_processing import postprocesser_ev_center

def load_onnx_model(model_path):
    """
    加载ONNX模型
    
    Args:
        model_path: ONNX模型路径
        
    Returns:
        ONNX运行时会话对象
    """
    print(f"--> 加载ONNX模型: {model_path}")
    # 创建ONNX运行时推理会话
    session_options = ort.SessionOptions()
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(model_path, sess_options=session_options)
    print("加载完成")
    return session

def preprocess_stream(stream, window_length=10000):
    """
    预处理数据流
    
    Args:
        stream: ObsPy Stream对象
        window_length: 窗口长度
        
    Returns:
        预处理后的数据数组，形状为[1, 3, window_length]
    """
    # 获取数据长度
    data_len = stream[0].data.shape[0]
    
    # 创建三通道波形数据
    tmp_waveform = np.zeros([data_len, 3])
    tmp_waveform[:,0] = stream.select(channel='*HZ')[0].data
    tmp_waveform[:,1] = stream.select(channel='*HN')[0].data
    tmp_waveform[:,2] = stream.select(channel='*HE')[0].data
    
    # 截取或填充到窗口长度
    if data_len > window_length:
        window = tmp_waveform[:window_length, :].copy()
    else:
        window = tmp_waveform.copy()
        # 填充不足的长度
        if window.shape[0] < window_length:
            padding = np.zeros((window_length - window.shape[0], window.shape[1]))
            window = np.vstack((window, padding))
    
    # 数据归一化 (每个通道独立归一化)
    for chdx in range(3):
        window[:,chdx] -= np.mean(window[:,chdx])
        window[:,chdx] /= np.std(window[:,chdx]) + 1e-8  # 避免除零错误
    
    # 转换为模型输入格式 [batch, channels, length]
    window_tensor = window[None, :]
    window_tensor = window_tensor.transpose(0, 2, 1)
    window_tensor = window_tensor.astype(np.float32)
    
    return window_tensor

def DiTing_predict_onnx(session, stream, window_length=10000, step_size=3000, p_th=0.1, s_th=0.1, det_th=0.50):
    """
    使用DiTing ONNX模型进行预测
    
    Args:
        session: ONNX运行时会话对象
        stream: ObsPy Stream对象
        window_length: 窗口长度
        step_size: 步长
        p_th: P波检测阈值
        s_th: S波检测阈值
        det_th: 事件检测阈值
        
    Returns:
        检测到的事件和置信度
    """
    print("--> 开始预测")
    
    # 获取输入和输出名称
    input_name = session.get_inputs()[0].name
    
    # 获取数据长度
    data_len = stream[0].data.shape[0]
    
    # 创建三通道波形数据
    tmp_waveform = np.zeros([data_len, 3])
    tmp_waveform[:,0] = stream.select(channel='*HZ')[0].data
    tmp_waveform[:,1] = stream.select(channel='*HN')[0].data
    tmp_waveform[:,2] = stream.select(channel='*HE')[0].data
    
    # 如果数据长度小于窗口长度，只处理一个窗口
    if data_len < window_length:
        num_windows = 1
        count = np.zeros((1, 3, 10000))
        confidence = np.zeros((1, 3, 10000))
    else:
        # 计算窗口数量
        num_windows = (data_len - window_length) // step_size + 1
        count = np.zeros((1, 3, tmp_waveform.shape[0]))
        confidence = np.zeros((1, 3, tmp_waveform.shape[0]))
    
    # 按窗口进行处理
    for i in range(num_windows):
        if i % 10 == 0:
            print(f"处理窗口 {i+1}/{num_windows}")
        
        # 计算窗口起止位置
        start = i * step_size
        end = start + window_length
        
        # 窗口计数
        count[:,:,start:end] += 1
        
        # 提取窗口数据
        window = tmp_waveform[start:end, :].copy()
        
        # 数据归一化
        for chdx in range(3):
            window[:,chdx] -= np.mean(window[:,chdx])
            window[:,chdx] /= np.std(window[:,chdx]) + 1e-8  # 避免除零错误
        
        # 填充不足长度的窗口
        if window.shape[0] < window_length:
            padding = np.zeros((window_length - window.shape[0], window.shape[1]))
            window = np.vstack((window, padding))
        
        # 转换为模型输入格式
        window_tensor = window[None, :]
        window_tensor = window_tensor.transpose(0, 2, 1)
        window_tensor = window_tensor.astype(np.float32)
        
        # 运行模型推理
        outputs = session.run(None, {input_name: window_tensor})
        output_np = outputs[0]  # 假设模型只有一个输出
        
        # 累加置信度
        if end <= confidence.shape[2]:
            confidence[:,:,start:end] += output_np
        else:
            confidence[:,:,start:] += output_np[:,:,:confidence.shape[2]-start]
    
    # 计算平均置信度
    with np.errstate(divide='ignore', invalid='ignore'):
        confidence = np.divide(confidence, count, out=np.zeros_like(confidence), where=count!=0)
    
    # 后处理检测事件
    events = postprocesser_ev_center(
        yh1=confidence[0, 0, :], yh2=confidence[0, 1, :], yh3=confidence[0, 2, :], 
        p_th=p_th, s_th=s_th, det_th=det_th)
    
    if len(events) == 0:
        events = [[np.nan, [[np.nan, np.nan]], [[np.nan, np.nan]]]]
    
    return events, confidence

def visualize_results(stream, events, output_file=None):
    """
    可视化预测结果
    
    Args:
        stream: ObsPy Stream对象
        events: 检测到的事件
        output_file: 输出文件路径，如果为None则显示图像
    """
    # 滤波处理
    st = stream.copy()
    st.filter('bandpass', freqmin=1, freqmax=20)
    
    # 随机选择一个事件进行可视化
    idx = 0  # 使用第一个事件
    t_P = events[idx][1][0]
    t_S = events[idx][2][0]
    
    # 如果没有有效的P或S拾取，则返回
    if np.isnan(t_P[0]) or np.isnan(t_S[0]):
        print("未检测到有效的P或S波到时")
        return
    
    # 转换采样点到时间
    t_P[0] = (obspy.UTCDateTime(st[0].stats.starttime) + t_P[0]/st[0].stats.sampling_rate)
    t_S[0] = (obspy.UTCDateTime(st[0].stats.starttime) + t_S[0]/st[0].stats.sampling_rate)
    
    # 截取地震事件片段
    st_slice = st.slice(starttime=t_P[0]-5, endtime=t_S[0]+20)
    
    # 绘图
    plt.figure(figsize=(12, 8))
    plt.rcParams['font.sans-serif'] = ['SimHei']  # 设置黑体或其他支持中文的字体
    plt.rcParams['axes.unicode_minus'] = False    # 解决负号显示为方块的问题
    # 绘制三个通道
    for i in range(3):
        plt.subplot(3, 1, i+1)
        plt.plot(st_slice[i].times(), st_slice[i].data, label=st_slice[i].stats.channel)
        plt.axvline(t_P[0] - st_slice[i].stats.starttime, color='r', label='P Arrival')
        plt.axvline(t_S[0] - st_slice[i].stats.starttime, color='g', label='S Arrival')
        plt.title(f'Channel {st_slice[i].stats.channel}')
        plt.legend(loc='upper right')
        
        if i == 0:
            plt.title(f'P Arrival: {t_P[0].strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]}\n'
                      f'S Arrival: {t_S[0].strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]}')
    
    plt.tight_layout()
    
    if output_file:
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"结果已保存至: {output_file}")
    else:
        plt.show()
    
    plt.close()

def main():
    # 设置模型和数据文件路径
    model_path = "DiTing0.1B_v15.onnx"
    data_path = "example_waveforms/demo_test_2.mseed"  # 修改为实际数据路径
    
    # 检查文件是否存在
    if not os.path.exists(model_path):
        print(f"错误: 模型文件 {model_path} 不存在")
        return
    
    if not os.path.exists(data_path):
        print(f"错误: 数据文件 {data_path} 不存在")
        return
    
    # 加载ONNX模型
    session = load_onnx_model(model_path)
    
    # 读取数据
    print(f"--> 读取数据: {data_path}")
    stream = obspy.read(data_path)
    print(f"数据长度: {stream[0].stats.npts} 采样点, 采样率: {stream[0].stats.sampling_rate} Hz")
    
    # 运行预测
    events, confidence = DiTing_predict_onnx(
        session, stream, 
        window_length=10000, step_size=3000, 
        p_th=0.1, s_th=0.1, det_th=0.3
    )
    
    # 输出检测结果
    print("\n预测结果:")
    for i, event in enumerate(events):
        if not np.isnan(event[1][0][0]) and not np.isnan(event[2][0][0]):
            p_sample = event[1][0][0]
            s_sample = event[2][0][0]
            p_time = stream[0].stats.starttime + p_sample / stream[0].stats.sampling_rate
            s_time = stream[0].stats.starttime + s_sample / stream[0].stats.sampling_rate
            print(f"事件 {i+1}:")
            print(f"  P波到时: {p_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} (样本点: {p_sample:.1f})")
            print(f"  S波到时: {s_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} (样本点: {s_sample:.1f})")
            print(f"  P-S时间差: {(s_time - p_time):.2f} 秒")
        else:
            print(f"事件 {i+1}: 未检测到有效的P或S波到时")
    
    # 可视化结果
    visualize_results(stream, events, output_file="DiTing_prediction_result.png")

if __name__ == "__main__":
    main() 