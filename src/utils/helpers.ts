import type { SmellMemory, RelationType } from './constants';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

type RelationSubject = Pick<SmellMemory, 'smell_type' | 'season' | 'emotion'>;

// 关系规则：相似=气味类型一致，延续=季节相同，反差=情绪不同
export function validateRelation(a: RelationSubject, b: RelationSubject, type: RelationType): string | null {
  if (type === 'similar' && a.smell_type !== b.smell_type) {
    return '「相似」要求两段记忆的气味类型一致';
  }
  if (type === 'continuation' && a.season !== b.season) {
    return '「延续」要求两段记忆的季节相同';
  }
  if (type === 'contrast' && a.emotion === b.emotion) {
    return '「反差」要求两段记忆的情绪不同';
  }
  return null;
}

export interface Filters {
  smellType: string;
  season: string;
  emotion: string;
  linkedOnly: boolean;
}

export function filterMemories(memories: SmellMemory[], filters: Filters): SmellMemory[] {
  return memories.filter(m => {
    if (filters.smellType && m.smell_type !== filters.smellType) return false;
    if (filters.season && m.season !== filters.season) return false;
    if (filters.emotion && m.emotion !== filters.emotion) return false;
    if (filters.linkedOnly && (m.relations?.length ?? 0) === 0) return false;
    return true;
  });
}

export interface RelationCounts {
  similar: number;
  continuation: number;
  contrast: number;
}

// 关系在双方卡片上各存一份，计数时按 id 排序去重，每条只算一次
export function getRelationCounts(memories: SmellMemory[]): RelationCounts {
  const counts: RelationCounts = { similar: 0, continuation: 0, contrast: 0 };
  for (const m of memories) {
    for (const r of m.relations ?? []) {
      if (m.id < r.targetId) counts[r.type] += 1;
    }
  }
  return counts;
}

export interface IntensityDistribution {
  bucket: string;
  count: number;
  range: [number, number];
}

export function getIntensityDistribution(memories: SmellMemory[]): IntensityDistribution[] {
  const buckets = [
    { bucket: '1-2', range: [1, 2] as [number, number] },
    { bucket: '3-4', range: [3, 4] as [number, number] },
    { bucket: '5-6', range: [5, 6] as [number, number] },
    { bucket: '7-8', range: [7, 8] as [number, number] },
    { bucket: '9-10', range: [9, 10] as [number, number] },
  ];
  return buckets.map(b => ({
    ...b,
    count: memories.filter(m => m.intensity >= b.range[0] && m.intensity <= b.range[1]).length,
  }));
}

export function getAverageIntensity(memories: SmellMemory[]): number {
  if (!memories.length) return 0;
  const sum = memories.reduce((acc, m) => acc + m.intensity, 0);
  return Math.round((sum / memories.length) * 10) / 10;
}

export function getTopIntensityMemories(memories: SmellMemory[], n = 5): SmellMemory[] {
  return [...memories].sort((a, b) => b.intensity - a.intensity).slice(0, n);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function contrastTextColor(hex: string): string {
  return isLightColor(hex) ? '#2A2118' : '#FBF7EE';
}
