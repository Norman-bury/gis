/**
 * 定义模拟结果的数据结构
 */
export interface SimulationResult {
  epicenter: { lat: number; lng: number };
  magnitude: number;
  intensityCircles: Array<{
    center: { lat: number; lng: number };
    radius: number; // 单位：米
    intensity: number; // 模拟的烈度等级
    color: string; // 用于地图显示的颜色
    label: string; // 烈度等级标签
  }>;
  affectedCities: Array<{ name: string; lat: number; lng: number; estimatedIntensity: number }>;
  affectedFacilities: Array<{ name: string; lat: number; lng: number; type: string; estimatedIntensity: number }>;
  estimatedAffectedPopulation: number;
}

// --- Helper Functions ---
/**
 * 计算两点之间的球面距离 (Haversine 公式)
 * @param lat1 点1纬度
 * @param lon1 点1经度
 * @param lat2 点2纬度
 * @param lon2 点2经度
 * @returns 距离 (米)
 */
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // 地球半径 (米)
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 距离 in 米
};

/**
 * 简化的烈度衰减模型 (仅用于演示)
 * M: 震级
 * R: 震中距 (km)
 * 返回模拟烈度 (可能需要根据实际模型调整参数)
 */
const calculateIntensity = (M: number, R_km: number): number => {
  if (R_km <= 0) return 12; // 震中烈度 (简化为最大)
  // 这是一个非常简化的示例公式，实际模型复杂得多
  // 尝试模拟烈度随距离对数衰减，随震级指数增加
  // 参数需要调整以获得更真实的效果
  let intensity = M * 1.5 - 2.0 * Math.log10(R_km + 1) + 1.5;
  // 限制烈度在 1-12 之间
  intensity = Math.max(1, Math.min(12, intensity));
  return intensity;
};

const EARTH_RADIUS_KM = 6371;
const MAX_RADIUS_KM = EARTH_RADIUS_KM * Math.PI; // Cap radius at half circumference

/**
 * 根据烈度反推大致影响半径 (km) (是 calculateIntensity 的逆运算，同样简化)
 * M: 震级
 * I: 目标烈度
 * 返回半径 (km)
 */
const getRadiusForIntensity = (M: number, I: number): number => {
  // 从 calculateIntensity 反推 R_km
  // I = M * 1.5 - 2.0 * Math.log10(R_km + 1) + 1.5
  // 2.0 * Math.log10(R_km + 1) = M * 1.5 - I + 1.5
  // Math.log10(R_km + 1) = (M * 1.5 - I + 1.5) / 2.0
  // R_km + 1 = 10 ** ((M * 1.5 - I + 1.5) / 2.0)
  const R_km_plus_1 = Math.pow(10, (M * 1.5 - I + 1.5) / 2.0);
  const R_km = R_km_plus_1 - 1;
  // Add upper cap and ensure it's a valid number
  return Math.min(MAX_RADIUS_KM, Math.max(0, R_km));
};

// --- Mock Data --- (这些数据应该是伪造的，用于演示)
const mockCities = [
  { name: '北京', lat: 39.9042, lng: 116.4074, population: 21540000 },
  { name: '天津', lat: 39.0842, lng: 117.2000, population: 13860000 },
  { name: '上海', lat: 31.2304, lng: 121.4737, population: 24870000 },
  { name: '广州', lat: 23.1291, lng: 113.2644, population: 18670000 },
  { name: '深圳', lat: 22.5431, lng: 114.0579, population: 17560000 },
  { name: '成都', lat: 30.5728, lng: 104.0668, population: 20930000 },
  { name: '重庆', lat: 29.5630, lng: 106.5515, population: 32050000 },
  { name: '武汉', lat: 30.5928, lng: 114.3055, population: 12320000 },
  { name: '西安', lat: 34.3416, lng: 108.9402, population: 12950000 },
  { name: '东京', lat: 35.6895, lng: 139.6917, population: 37430000 }, // 添加国外城市
  { name: '旧金山', lat: 37.7749, lng: -122.4194, population: 883305 },
];

const mockFacilities = [
  { name: '三峡大坝', type: 'dam', lat: 30.8230, lng: 111.0036 },
  { name: '大亚湾核电站', type: 'nuclear', lat: 22.5989, lng: 114.5444 },
  { name: '首都国际机场', type: 'airport', lat: 40.0799, lng: 116.5855 },
  { name: '浦东国际机场', type: 'airport', lat: 31.1443, lng: 121.8083 },
];

// 简化的人口密度模型：假设人口均匀分布在城市半径内 (非常粗略)
const getCityRadius = (population: number): number => {
  // 假设人口密度与半径平方成反比，随便定个系数
  return Math.sqrt(population / 1000) * 1000; // 返回米
};

// 定义烈度等级和颜色
const intensityLevels = [
  { level: 12, color: '#7c0000', label: 'XII 毁灭' }, // 深红
  { level: 11, color: '#a00000', label: 'XI 极灾' },
  { level: 10, color: '#c40000', label: 'X 灾难' },
  { level: 9, color: '#dc143c', label: 'IX 毁坏' }, // crimson
  { level: 8, color: '#ff4500', label: 'VIII 严重破坏' }, // orangered
  { level: 7, color: '#ff8c00', label: 'VII 破坏' }, // darkorange
  { level: 6, color: '#ffa500', label: 'VI 轻微破坏' }, // orange
  { level: 5, color: '#ffd700', label: 'V 惊醒' }, // gold
  { level: 4, color: '#ffff00', label: 'IV 普遍有感' }, // yellow
  // 更低烈度一般不绘制影响圈
];

/**
 * 模拟地震影响 (实现)
 * @param epicenter 震中 {lat, lng}
 * @param magnitude 震级
 * @returns SimulationResult 模拟结果
 */
export const simulateImpact = async (
  epicenter: { lat: number; lng: number },
  magnitude: number
): Promise<SimulationResult> => {
  console.log(`[Mock Simulator] Simulating: epicenter=${JSON.stringify(epicenter)}, magnitude=${magnitude}`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟耗时

  const result: SimulationResult = {
    epicenter,
    magnitude,
    intensityCircles: [],
    affectedCities: [],
    affectedFacilities: [],
    estimatedAffectedPopulation: 0,
  };

  // 1. 计算各烈度圈半径并添加到结果
  for (const level of intensityLevels) {
    const radiusKm = getRadiusForIntensity(magnitude, level.level);
    if (radiusKm > 0) { // 只添加有意义的半径
      const radiusMeters = radiusKm * 1000;
      result.intensityCircles.push({
        center: epicenter,
        radius: radiusMeters,
        intensity: level.level,
        color: level.color,
        label: level.label,
      });
    }
  }
  // 按半径降序排序，方便地图绘制层级
  result.intensityCircles.sort((a, b) => b.radius - a.radius);

  // 2. 判断影响范围内的城市/设施
  const maxRadiusMeters = result.intensityCircles[0]?.radius || 0;

  if (maxRadiusMeters > 0) {
    mockCities.forEach(city => {
      const distanceMeters = getDistance(epicenter.lat, epicenter.lng, city.lat, city.lng);
      if (distanceMeters <= maxRadiusMeters) {
        const estimatedIntensity = calculateIntensity(magnitude, distanceMeters / 1000);
        // Ensure intensity is rounded for consistent threshold checking
        const roundedIntensity = Math.round(estimatedIntensity);
        result.affectedCities.push({ ...city, estimatedIntensity: roundedIntensity });

        // 3. Estimate affected population (Revised Logic - Linear Factor, No Radius Check)
        // Revised Again: Start counting from Intensity V (5), use linear factor, remove city radius check for now.
        const intensityThreshold = 5; // Threshold V
        if (roundedIntensity >= intensityThreshold) { // Remove city radius check, use rounded intensity
            // Factor starts small (e.g., 1%) at intensity 5 and grows linearly to maxFactor at intensity 12.
            const maxFactor = 0.8;
            const minFactor = 0.01; // Minimum factor at threshold (1%)
            const intensityRange = 12 - intensityThreshold; // Range is 7
            const relativeIntensity = Math.max(0, roundedIntensity - intensityThreshold);
            let intensityFactor = minFactor + (maxFactor - minFactor) * (relativeIntensity / intensityRange);
            intensityFactor = Math.min(maxFactor, Math.max(minFactor, intensityFactor)); // Ensure factor stays within bounds
            // Example: Intensity 5 -> 0.01; Intensity 6 -> ~0.12; Intensity 9 -> ~0.46; Intensity 12 -> 0.8
            const affectedPop = Math.round(city.population * intensityFactor);
            console.log(`  ${city.name} Intensity: ${roundedIntensity}, Factor: ${intensityFactor.toFixed(3)}, Affected Pop: ${affectedPop.toLocaleString()}`);
            result.estimatedAffectedPopulation += affectedPop;
        }
      }
    });

    mockFacilities.forEach(facility => {
      const distanceMeters = getDistance(epicenter.lat, epicenter.lng, facility.lat, facility.lng);
      if (distanceMeters <= maxRadiusMeters) {
        const estimatedIntensity = calculateIntensity(magnitude, distanceMeters / 1000);
        result.affectedFacilities.push({ ...facility, estimatedIntensity: Math.round(estimatedIntensity) });
      }
    });
  }

  // 按估算烈度降序排序
  result.affectedCities.sort((a, b) => b.estimatedIntensity - a.estimatedIntensity);
  result.affectedFacilities.sort((a, b) => b.estimatedIntensity - a.estimatedIntensity);

  console.log("[Mock Simulator] Simulation complete:", result);
  return result;
}; 